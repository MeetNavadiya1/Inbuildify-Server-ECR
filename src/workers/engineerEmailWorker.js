import Bull from "bull";
import { Op } from "sequelize";
import { env } from "../config/env.config.js";
import db from "../config/database/models/postgre-models/index.js";
import sendEmail from "../service/sendMail.service.js";
import { logActivity } from "../utils/activityLogger.js";
import { generatePresignedDownloadUrl } from "../service/s3.service.js";
import { wrapEngineerEmailHTML } from "../templates/engineer-email.template.js";
import { getQuotationDriveFileS3Key } from "../helper/quotationDriveFile.helper.js";
import { resolveCompactionS3Key } from "../helper/propertyDriveFile.helper.js";
import { DRIVE_FILE_MAPPING } from "../constants/driveFile.js";

import { bullQueueOptions } from "../config/redisBull.config.js";

const engineerEmailQueue = new Bull("engineerEmailQueue", bullQueueOptions());

// Re-fetch the version with everything the engineer email needs (engineer,
// property, and the spec fields shown in the email body). Mirrors the service's
// _fetchQuotationVersionForEngineer so the worker is self-contained — like
// quotationEmailWorker, it never imports the service (avoids a circular import).
async function fetchVersionForEngineer(versionId) {
  const {
    QuotationVersion, StructureEngineer, Quotation, Leads, PropertyDetail,
    Location, Range, DwellingType, FloorPlan, Facade, Package,
  } = db;

  return QuotationVersion.findOne({
    where: { quotation_version_id: versionId },
    include: [
      { model: StructureEngineer, as: "structureEngineer" },
      {
        model: Quotation,
        as: "quotation",
        include: [
          {
            model: Leads,
            as: "lead",
            include: [{ model: PropertyDetail, as: "propertyDetail" }],
          },
        ],
      },
      { model: Location, as: "location", attributes: ["name"] },
      { model: Range, as: "range", attributes: ["name"] },
      { model: DwellingType, as: "dwellingType", attributes: ["name"] },
      { model: FloorPlan, as: "floorPlan", attributes: ["name"] },
      { model: Facade, as: "facade", attributes: ["name"] },
      { model: Package, as: "package", attributes: ["name"] },
    ],
  });
}

// The builder UI stores the selected package as a snapshot row in
// quotation_version_items and historically never set quotation_version.package_id,
// so the belongsTo include can be null even when a package is selected — fall
// back to the snapshot row. Mirrors the service's _resolveEngineerPdfPackage.
async function resolveEngineerPackage(versionPlain) {
  if (versionPlain.package) return { ...versionPlain.package };
  if (!versionPlain.quotation_version_id) return null;

  const { QuotationVersionItem } = db;
  const snapshot = await QuotationVersionItem.findOne({
    where: {
      quotation_version_id: versionPlain.quotation_version_id,
      package_id: { [Op.ne]: null },
    },
    attributes: ["package_name"],
  });

  return snapshot ? { name: snapshot.package_name } : null;
}

engineerEmailQueue.process(async (job) => {
  const { versionId, userId, emailData = {} } = job.data;
  const { QuotationVersion, Notifications } = db;

  // 1. Re-fetch version + engineer + property (worker can't trust stale job data)
  const version = await fetchVersionForEngineer(versionId);
  if (!version) throw new Error("Quotation version not found");

  const engineer = version.structureEngineer;
  if (!engineer || !engineer.email) {
    throw new Error("Structure Engineer does not have a valid email address");
  }

  const versionPlain = version.get({ plain: true });
  const property = versionPlain.quotation?.lead?.propertyDetail || {};
  const selectedPackage = await resolveEngineerPackage(versionPlain);

  // 2. Subject/body defaults when the quick-send flow omits them
  const subject = emailData.subject || `Engineering Requirement – ${[property.lot_number ? `Lot ${property.lot_number}` : null, property.street, property.city]
    .filter(Boolean).join(", ") || "New Request"
    }`;
  const emailBody = emailData.email_body || [
    `<p>Hi ${engineer.name || "Engineer"},</p>`,
    `<p>Please use the download buttons below to access the Engineering Requirement documents for your review.</p>`,
    property.lot_number ? `<p><strong>Property:</strong> Lot ${property.lot_number}, ${property.street || ""}, ${property.city || ""} ${property.zip_code || ""}</p>` : "",
    `<p>Kindly review and upload your structural report at your earliest convenience.</p>`,
    `<p>Thank you.</p>`,
  ].filter(Boolean).join("\n");

  // 3. Resolve the document S3 keys (Engineering Requirement required;
  // Compaction Report optional). These are delivered as download links — not
  // attachments — so the email stays small and survives providers that strip
  // attachments or reject large messages (mailinator/yopmail do both).
  const engReqKey = await getQuotationDriveFileS3Key(
    versionId,
    DRIVE_FILE_MAPPING.SUB_REFERENCES.ENGINEERING_REQUIREMENT,
  );
  if (!engReqKey) {
    throw new Error("Engineering Requirement PDF is missing. Please generate it again before sending.");
  }
  const compactionKey = await resolveCompactionS3Key(property.compaction_report_url || null);

  // 4. Build branded HTML + plain-text fallback
  const address = [
    property.lot_number ? `Lot ${property.lot_number}` : null,
    property.street,
    property.city,
    property.zip_code,
  ].filter(Boolean).join(", ") || null;

  const uploadUrl = env.EMAIL?.FRONTEND_BASE_URL
    ? `${env.EMAIL.FRONTEND_BASE_URL}/external?Type=structuralengineer&id=${versionId}`
    : "";

  // Presigned download links (7 days) mirror the attachments so the documents
  // stay reachable even when the recipient strips attachments or rejects large
  // messages (disposable inboxes like mailinator/yopmail do both).
  const [engReqPresigned, compactionPresigned] = await Promise.all([
    generatePresignedDownloadUrl(engReqKey, 604800),
    compactionKey ? generatePresignedDownloadUrl(compactionKey, 604800) : Promise.resolve(null),
  ]);

  const html = wrapEngineerEmailHTML({
    subject,
    bodyHtml: emailBody,
    specs: {
      address,
      rangeName: versionPlain.range?.name,
      floorPlanName: versionPlain.floorPlan?.name,
      facadeName: versionPlain.facade?.name,
      packageName: selectedPackage?.name,
    },
    uploadUrl,
    engReqUrl: engReqPresigned?.success ? engReqPresigned.url : "",
    compactionUrl: compactionPresigned?.success ? compactionPresigned.url : "",
  });

  const plainText = String(emailBody)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "Please use the download links in this email to access the engineering requirement documents.";

  // 5. Hand off to the shared email queue. No attachments — the PDFs are linked
  // via the presigned download buttons in the HTML body above.
  await sendEmail(engineer.email, subject, plainText, html, [], null, []);

  // 6. Mark as sent. The updateQuotationVersion safeguard then blocks changing
  // the structure_engineer_id once send_to_engineer is true.
  await QuotationVersion.update(
    { send_to_engineer: true, is_uploaded: false },
    { where: { quotation_version_id: versionId } },
  );

  // 7. Log notification
  const notification = await Notifications.create({
    sender_id: userId || null,
    receiver_info: JSON.stringify({ to: engineer.email, name: engineer.name }),
    template_id: null,
    notification_type: "EMAIL",
    title: subject,
    body: `Engineering Requirement sent to ${engineer.email} for version ${versionId}`,
    metadata_json: JSON.stringify({ quotationVersionId: versionId, engineerEmail: engineer.email }),
    delivery_status: "SENT",
  });

  const leadId = versionPlain.quotation?.lead?.leads_id;
  await logActivity(null, {
    userId: userId || null,
    companyId: versionPlain.quotation?.lead?.company_id || null,
    builderId: versionPlain.quotation?.lead?.builder_id || null,
    referenceId: leadId || notification.notifications_id,
    referenceType: leadId ? "LEAD" : "EMAIL",
    module: "Email",
    moduleId: notification.notifications_id,
    recordName: subject,
    action: "EMAIL_SENT",
    description: `Sent email: ${subject}`,
    metadata: { quotationVersionId: versionId, engineerEmail: engineer.email },
  });

  console.log(`[EngineerEmailWorker] Job complete — versionId: ${versionId}, to: ${engineer.email}`);
  return { success: true, email: engineer.email };
});

engineerEmailQueue.on("failed", async (job, err) => {
  const { versionId, userId } = job.data;
  console.error(`[EngineerEmailWorker] Job ${job.id} failed for versionId ${versionId}:`, err.message);

  // Log failure to notifications table once all retries are exhausted.
  if (job.attemptsMade >= job.opts.attempts) {
    try {
      const { Notifications } = db;
      await Notifications.create({
        sender_id: userId || null,
        receiver_info: JSON.stringify({ versionId }),
        template_id: null,
        notification_type: "EMAIL",
        title: "Engineer email delivery failed",
        body: `Failed to send engineer email for version ${versionId}`,
        metadata_json: JSON.stringify({ quotationVersionId: versionId, error: err.message }),
        delivery_status: "FAILED",
        failure_reason: err.message.slice(0, 500),
      });
    } catch (logErr) {
      console.error("[EngineerEmailWorker] Failed to log failure to notifications table:", logErr.message);
    }
  }
});

engineerEmailQueue.on("completed", (job, result) => {
  console.log(`[EngineerEmailWorker] Job ${job.id} completed:`, result);
});

console.log("Engineer email worker started...");

export default engineerEmailQueue;
