import { env } from "../config/env.config.js";
import db from "../config/database/models/postgre-models/index.js";
import { uploadFile } from "../service/s3.service.js";
import { generatePDF } from "../modules/quotation/pdf.service.js";
import {
  wrapCommencementLetterHTML,
  generateCommencementLetterPdfHtml,
} from "../templates/commencement-letter.template.js";
import notificationQueue from "./notificationWorker.js";
import { getQuotationVersionGrandTotal } from "../helper/quotationTotal.helper.js";

// Re-fetch the job with everything the commencement letter needs (lead,
// property, builder, consultant). Self-contained so the worker never imports
// the service (avoids a circular import), mirroring engineerEmailWorker.
async function fetchJobForLetter(jobId) {
  const { Job, Opportunity, Leads, PropertyDetail, State, Users, Builder } = db.sequelize.models;

  return Job.findOne({
    where: { job_id: jobId },
    include: [  
      {
        model: Opportunity,
        as: "opportunity",
        include: [
          {
            model: Leads,
            as: "lead",
            include: [
              { model: PropertyDetail, as: "propertyDetail", include: [{ model: State, as: "state" }] },
              { model: Users, as: "assignee" },
            ],
          },
        ],
      },
      { model: Builder, as: "builder" },
    ],
  });
}

function buildJobAddress(propertyDetail, state) {
  return [
    propertyDetail?.lot_number,
    propertyDetail?.street,
    propertyDetail?.address_line1,
    propertyDetail?.address_line2,
    propertyDetail?.city,
    state?.name,
    propertyDetail?.zip_code,
  ]
    .map((s) => s?.trim?.() || s)
    .filter(Boolean)
    .join(", ") || null;
}

notificationQueue.process("commencementLetter", async (job) => {
  const { jobId, userId, emailData = {} } = job.data;
  const { QuotationVersionItem, Notifications, Job } = db;

  // 1. Re-fetch job + lead + property + builder (worker can't trust stale data)
  const jobRecord = await fetchJobForLetter(jobId);
  if (!jobRecord) throw new Error("Job not found");

  const jobPlain = jobRecord.get({ plain: true });
  const lead = jobPlain.opportunity?.lead || {};
  const propertyDetail = lead.propertyDetail || {};
  const state = propertyDetail.state || {};
  const consultant = lead.assignee || {};
  const builder = jobPlain.builder || {};

  // 2. Resolve recipients. The frontend "To" field selects these; fall back to
  // the customer email if none were provided.
  const toList = (Array.isArray(emailData.to) ? emailData.to : [emailData.to])
    .filter((e) => typeof e === "string" && e.trim())
    .map((e) => e.trim());
  const ccList = (Array.isArray(emailData.cc) ? emailData.cc : [])
    .filter((e) => typeof e === "string" && e.trim())
    .map((e) => e.trim());

  if (toList.length === 0) {
    throw new Error("No valid recipient email addresses provided");
  }

  const jobAddress = buildJobAddress(propertyDetail, state);
  const referenceNumber = jobPlain.reference_number;

  // 3. Subject / message defaults when the quick-send flow omits them.
  const subject = emailData.subject || `Commencement Letter${referenceNumber ? ` – ${referenceNumber}` : ""}`;
  const message = emailData.message
    || `<p>Dear ${lead.name || "Customer"},</p>
        <p>We are pleased to confirm the commencement of your building works. Please find the Commencement Letter attached to this email for your records.</p>
        <p>If you have any questions, please reach out to your consultant.</p>
        <p>Kind regards,<br/>${builder.name || "inBuildify"}</p>`;

  // 4. Quotation total for the PDF summary — the quoted grand total, matching
  // the job's Cost Summary. A bare item sum omits the structure engineer and
  // facade charges held on the version itself.
  const quotationTotal = await getQuotationVersionGrandTotal(jobPlain.quotation_version_id);

  // 5. Generate the Commencement Letter PDF and upload to S3. It is delivered as
  // an attachment via attachmentKeys (resolved by notificationWorker at send
  // time) so the PDF bytes never sit in Redis as base64.
  const pdfHtml = generateCommencementLetterPdfHtml({
    referenceNumber,
    customerName: lead.name,
    jobAddress,
    builderName: builder.name,
    consultantName: consultant.name,
    estateName: propertyDetail.estate_name,
    titleDate: propertyDetail.title_date,
    // 0 means no priced version — keep the field blank rather than printing "$0".
    quotationTotal: quotationTotal ? Number(quotationTotal).toFixed(2) : null,
    jobNote: jobPlain.job_note,
    message,
  });
  const pdfBuffer = await generatePDF(pdfHtml);

  const safeRef = (referenceNumber || jobId).replace(/[^a-zA-Z0-9_-]/g, "_");
  const s3Key = `commencement-letters/${jobId}/Commencement_Letter_${safeRef}.pdf`;
  const uploadResult = await uploadFile(s3Key, pdfBuffer, "application/pdf");
  if (!uploadResult?.success) {
    throw new Error("Failed to upload Commencement Letter PDF");
  }

  // 6. Build the branded "Notice of Commencement" email. The structured template
  // owns the body; the customer acknowledges via a link to the public /external
  // page (Type=commencement). The freeform message lives in the attached PDF.
  const acknowledgeUrl = env.EMAIL?.FRONTEND_BASE_URL
    ? `${env.EMAIL.FRONTEND_BASE_URL}/external?Type=commencement&id=${jobId}`
    : "#";

  const html = wrapCommencementLetterHTML({
    customerName: lead.name,
    ownerName: lead.name,
    ownerEmail: lead.email,
    contractorName: builder.name,
    contractorEmail: builder.email,
    jobAddress,
    acknowledgeUrl,
    senderName: consultant.name || builder.name,
  });
  const plainText = `Dear ${lead.name || "Customer"}, work has commenced at ${jobAddress || "your property"}. `
    + `Please acknowledge receipt of this notice: ${acknowledgeUrl}`;

  // 7. Queue email to notificationQueue with the PDF attached.
  await notificationQueue.add(
    {
      to: toList,
      subject,
      text: plainText,
      html,
      attachments: [],
      cc: ccList.length > 0 ? ccList : null,
      attachmentKeys: [
        { key: s3Key, filename: `Commencement_Letter_${safeRef}.pdf`, contentType: "application/pdf" },
      ],
    },
    {
      attempts: 3,
      backoff: { type: "exponential", delay: 10000 },
      removeOnComplete: true,
      removeOnFail: 50,
    },
  );

  // 8. Mark the job as having had its Commencement Letter sent, and open the
  // acknowledgment as PENDING so the public page knows a response is awaited.
  await Job.update(
    { commencement_letter_sent: true, commencement_ack_status: "PENDING" },
    { where: { job_id: jobId } },
  );

  // 9. Log notification.
  await Notifications.create({
    sender_id: userId || null,
    receiver_info: JSON.stringify({ to: toList, cc: ccList, name: lead.name }),
    template_id: null,
    notification_type: "EMAIL",
    title: subject,
    body: `Commencement Letter sent to ${toList.join(", ")} for job ${referenceNumber || jobId}`,
    metadata_json: JSON.stringify({ jobId, to: toList, cc: ccList, s3Key }),
    delivery_status: "SENT",
  });

  console.log(`[CommencementLetterWorker] Job complete — jobId: ${jobId}, to: ${toList.join(", ")}`);
  return { success: true, to: toList };
});

notificationQueue.on("failed", async (job, err) => {
  if (job.name !== "commencementLetter") return;
  const { jobId, userId } = job.data;
  console.error(`[CommencementLetterWorker] Job ${job.id} failed for jobId ${jobId}:`, err.message);

  // Log failure to notifications table once all retries are exhausted.
  if (job.attemptsMade >= job.opts.attempts) {
    try {
      const { Notifications } = db;
      await Notifications.create({
        sender_id: userId || null,
        receiver_info: JSON.stringify({ jobId }),
        template_id: null,
        notification_type: "EMAIL",
        title: "Commencement Letter delivery failed",
        body: `Failed to send Commencement Letter for job ${jobId}`,
        metadata_json: JSON.stringify({ jobId, error: err.message }),
        delivery_status: "FAILED",
        failure_reason: err.message.slice(0, 500),
      });
    } catch (logErr) {
      console.error("[CommencementLetterWorker] Failed to log failure to notifications table:", logErr.message);
    }
  }
});

notificationQueue.on("completed", (job, result) => {
  if (job.name !== "commencementLetter") return;
  console.log(`[CommencementLetterWorker] Job ${job.id} completed:`, result);
});

console.log("Commencement letter worker registered on notificationQueue...");

export default notificationQueue;
