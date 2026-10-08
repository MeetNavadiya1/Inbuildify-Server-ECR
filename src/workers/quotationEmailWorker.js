import Bull from "bull";
import { env } from "../config/env.config.js";
import db from "../config/database/models/postgre-models/index.js";
import quotationRepository from "../modules/quotation/quotation.repository.js";
import { generatePDF } from "../modules/quotation/pdf.service.js";
import { generateQuotationHTML } from "../utils/template.js";
import { inlineQuotationPdfImages } from "../utils/quotationPdfImages.js";
import { uploadFile, generatePresignedDownloadUrl } from "../service/s3.service.js";
import docusignService from "../service/docusign.service.js";
import { encodeQuotationHash, encodeSignToken } from "../utils/hashEncoder.js";
import { renderTemplate } from "../utils/templateRenderer.js";
import sendEmail from "../service/sendMail.service.js";
import { logActivity } from "../utils/activityLogger.js";
import { Op } from "sequelize";

import { bullQueueOptions } from "../config/redisBull.config.js";

const quotationEmailQueue = new Bull("quotationEmailQueue", bullQueueOptions());

quotationEmailQueue.process(async (job) => {
  const { versionId, userId, builderId, companyId } = job.data;
  const { QuotationVersion, Quotation, Leads, NotificationTemplate, Notifications } = db;

  // 1. Re-fetch ownership + builder context
  const quotation = await QuotationVersion.findOne({
    where: { quotation_version_id: versionId },
    include: [
      {
        model: Quotation,
        as: "quotation",
        include: [{
          model: Leads,
          as: "lead",
          where: {
            [Op.or]: [
              { builder_id: builderId },
              ...(companyId ? [{ company_id: companyId }] : [])
            ]
          }
        }]
      }
    ]
  });

  if (!quotation) throw new Error("Quotation version not found or unauthorized");
  const qData = quotation.get({ plain: true });
  const lead = qData.quotation.lead;

  if (!lead.email) throw new Error("Customer email not available");

  const builderIdForTemplate = lead.builder_id || builderId;

  // 2. Load QUOTATION_SEND notification template from DB
  const notifTemplate = await NotificationTemplate.findOne({
    where: { builder_id: builderIdForTemplate, template_type: "QUOTATION_SEND", is_active: true },
  });

  if (!notifTemplate) {
    throw new Error(`QUOTATION_SEND notification template not found for builder ${builderIdForTemplate}. Run seeders.`);
  }

  // 3. Full version details for PDF + CC contacts
  const versionDetails = await quotationRepository.getQuotationVersionDetailsById(versionId);
  if (!versionDetails) throw new Error("Quotation version details not found");

  // 4. Generate PDF → upload to S3 (inline DriveFile-UUID image refs first —
  // the raw-SQL details query bypasses the afterFind URL-resolution hooks)
  await inlineQuotationPdfImages(versionDetails);
  const htmlContent = generateQuotationHTML(versionDetails);
  const pdfBuffer = await generatePDF(htmlContent);
  console.log(`[QuotationEmailWorker] PDF generated for ${versionId}, size: ${pdfBuffer.length} bytes`);

  const s3Key = `quotations/${versionId}/Quotation_v${versionDetails.quotationVersionNo}.pdf`;
  const uploadResult = await uploadFile(s3Key, pdfBuffer, "application/pdf");
  if (!uploadResult.success) throw new Error("Failed to upload PDF to S3");
  await quotationRepository.updatePdfUrl(versionId, uploadResult.key, {
    size: pdfBuffer.length,
    originalName: `Quotation_v${versionDetails.quotationVersionNo}.pdf`,
    builderId,
    companyId,
  });

  // 5. Build URLs
  const frontendBaseUrl = env.EMAIL.FRONTEND_BASE_URL || "http://localhost:3000";
  const backendBaseUrl = env.EMAIL.BACKEND_BASE_URL;
  const secureHash = encodeQuotationHash(qData.quotation_id, lead.leads_id);
  const viewUrl = `${frontendBaseUrl}/quotation/view?token=${secureHash}`;

  // 6. Signers + CC
  const signerName = lead.name || "Customer";
  const primarySigner = {
    email: lead.email,
    name: signerName,
    routingOrder: "1",
    clientUserId: lead.email,
  };

  const ccRecipients = (versionDetails.leadContacts || [])
    .filter((c) => c.email && c.email !== lead.email)
    .map((c) => ({ email: c.email, name: c.name || c.email, routingOrder: "2" }));

  // Add structural engineer if selected
  if (versionDetails.sendToEngineer && versionDetails.structuralEngineer?.email) {
    const engEmail = versionDetails.structuralEngineer.email;
    if (!ccRecipients.some(c => c.email === engEmail) && engEmail !== lead.email) {
      ccRecipients.push({
        email: engEmail,
        name: versionDetails.structuralEngineer.name || engEmail,
        routingOrder: "2"
      });
    }
  }

  // 7. Create DocuSign envelope
  const docusignResult = await docusignService.createQuotationEnvelope(
    versionId,
    {
      signers: [primarySigner],
      ccRecipients,
      emailSubject: `Your Quotation – ${qData.quotation.reference_number}`,
      emailBlurb: `Please review your quotation (${qData.quotation.reference_number}) and sign it. View: ${viewUrl}`,
      useEmbeddedSigning: true,
      pdfBuffer,
    },
    userId,
    lead.leads_id
  );

  const { envelopeId } = docusignResult;

  await QuotationVersion.update(
    { esign_status: "sent", esign_envelope_id: envelopeId },
    { where: { quotation_version_id: versionId } }
  );

  // 8. Build sign token
  const signToken = encodeSignToken(envelopeId, lead.email, signerName);
  const signUrl = `${backendBaseUrl}/docusign/public/sign?token=${signToken}`;

  const presignedResult = await generatePresignedDownloadUrl(s3Key, 604800);
  const downloadUrl = presignedResult.success ? presignedResult.url : uploadResult.location;

  // 9. Render template
  const templateContext = {
    customerName: signerName,
    referenceNumber: qData.quotation.reference_number,
    versionNo: versionDetails.quotationVersionNo,
    signUrl,
    viewUrl,
    downloadUrl,
  };

  const renderedTitle = renderTemplate(notifTemplate.title, templateContext);
  const renderedBody = renderTemplate(notifTemplate.body, templateContext);

  // 10. Send email
  const ccEmailList = ccRecipients.map((c) => c.email);
  const plainText = `Dear ${signerName}, your quotation ${qData.quotation.reference_number} is ready. Sign here: ${signUrl}`;

  await sendEmail(
    lead.email,
    renderedTitle,
    plainText,
    renderedBody,
    [],
    ccEmailList.length > 0 ? ccEmailList : null
  );

  // 11. Log notification
  const notification = await Notifications.create({
    sender_id: userId || null,
    receiver_info: JSON.stringify({
      to: lead.email,
      cc: ccEmailList,
      name: signerName,
    }),
    template_id: notifTemplate.notification_template_id,
    notification_type: "EMAIL",
    title: renderedTitle,
    body: `Quotation ${qData.quotation.reference_number} sent for signing. EnvelopeId: ${envelopeId}`,
    metadata_json: JSON.stringify({
      quotationVersionId: versionId,
      quotationId: qData.quotation_id,
      envelopeId,
      referenceNumber: qData.quotation.reference_number,
      leadsId: lead.leads_id,
    }),
    delivery_status: "SENT",
  });

  await logActivity(null, {
    userId: userId || null,
    companyId: companyId || null,
    builderId: builderId || null,
    referenceId: lead.leads_id || notification.notifications_id,
    referenceType: lead.leads_id ? "LEAD" : "EMAIL",
    module: "Email",
    moduleId: notification.notifications_id,
    recordName: renderedTitle,
    action: "EMAIL_SENT",
    description: `Sent email: ${renderedTitle}`,
    metadata: {
      quotationVersionId: versionId,
      quotationId: qData.quotation_id,
      envelopeId,
      referenceNumber: qData.quotation.reference_number,
      leadsId: lead.leads_id,
    },
  });

  console.log(`[QuotationEmailWorker] Job complete — versionId: ${versionId}, envelopeId: ${envelopeId}`);
  return { success: true, envelopeId };
});

quotationEmailQueue.on("failed", async (job, err) => {
  const { versionId, userId } = job.data;
  console.error(`[QuotationEmailWorker] Job ${job.id} failed for versionId ${versionId}:`, err.message);

  // Log failure to notifications table if all retries exhausted
  if (job.attemptsMade >= job.opts.attempts) {
    try {
      const { Notifications } = db;
      await Notifications.create({
        sender_id: userId || null,
        receiver_info: JSON.stringify({ versionId }),
        template_id: null,
        notification_type: "EMAIL",
        title: "Quotation email delivery failed",
        body: `Failed to send quotation email for version ${versionId}`,
        metadata_json: JSON.stringify({ quotationVersionId: versionId, error: err.message }),
        delivery_status: "FAILED",
        failure_reason: err.message.slice(0, 500),
      });
    } catch (logErr) {
      console.error("[QuotationEmailWorker] Failed to log failure to notifications table:", logErr.message);
    }
  }
});

quotationEmailQueue.on("completed", (job, result) => {
  console.log(`[QuotationEmailWorker] Job ${job.id} completed, envelopeId: ${result.envelopeId}`);
});

console.log("Quotation email worker started...");

export default quotationEmailQueue;
