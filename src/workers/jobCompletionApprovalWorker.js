import { env } from "../config/env.config.js";
import db from "../config/database/models/postgre-models/index.js";
import { uploadFile } from "../service/s3.service.js";
import { generatePDF } from "../modules/quotation/pdf.service.js";
import {
  wrapJobCompletionApprovalHTML,
  generateJobCompletionApprovalPdfHtml,
} from "../templates/job-completion-approval.template.js";
import notificationQueue from "./notificationWorker.js";
import { getQuotationVersionGrandTotal } from "../helper/quotationTotal.helper.js";

// Re-fetch the job with everything the approval request needs (lead, property,
// builder, consultant, approver). Self-contained so the worker never imports the
// service (avoids a circular import), mirroring commencementLetterWorker.
async function fetchJobForApproval(jobId) {
  const { Job, Opportunity, Leads, PropertyDetail, State, Users, Builder, Role } = db.sequelize.models;

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
      {
        model: Users,
        as: "completionApprover",
        include: [{ model: Role, as: "role", attributes: ["name"], required: false }],
      },
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

// "2026-07-23" / Date -> "23 Jul 2026". Blank when the date was not provided.
function formatDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}

notificationQueue.process("jobCompletionApproval", async (job) => {
  const { jobId, userId, requestedByName, dates = {} } = job.data;
  const { Notifications } = db;

  // 1. Re-fetch job + lead + property + builder + approver.
  const jobRecord = await fetchJobForApproval(jobId);
  if (!jobRecord) throw new Error("Job not found");

  const jobPlain = jobRecord.get({ plain: true });
  const lead = jobPlain.opportunity?.lead || {};
  const propertyDetail = lead.propertyDetail || {};
  const state = propertyDetail.state || {};
  const consultant = lead.assignee || {};
  const builder = jobPlain.builder || {};
  const approver = jobPlain.completionApprover || {};

  if (!approver.email) {
    throw new Error("Approver email not available for this job");
  }

  const jobAddress = buildJobAddress(propertyDetail, state);
  const referenceNumber = jobPlain.reference_number;
  const approverRole = approver.role?.name || null;

  const pciDate = formatDate(dates.pciDate);
  const occupancyPermitDate = formatDate(dates.occupancyPermitDate);
  const handoverDate = formatDate(dates.handoverDate);

  // 2. Quotation total for the PDF summary — same source as the Cost Summary.
  const quotationTotal = await getQuotationVersionGrandTotal(jobPlain.quotation_version_id);

  // 3. Generate the approval PDF and upload to S3. It is delivered via
  // attachmentKeys (resolved by notificationWorker at send time) so the PDF
  // bytes never sit in Redis as base64.
  const pdfHtml = generateJobCompletionApprovalPdfHtml({
    referenceNumber,
    customerName: lead.name,
    jobAddress,
    builderName: builder.name,
    consultantName: consultant.name,
    estateName: propertyDetail.estate_name,
    approverName: approver.name,
    approverRole,
    approverEmail: approver.email,
    requestedBy: requestedByName,
    pciDate,
    occupancyPermitDate,
    handoverDate,
    quotationTotal: quotationTotal ? Number(quotationTotal).toFixed(2) : null,
    jobNote: jobPlain.job_note,
    date: formatDate(new Date()),
  });
  const pdfBuffer = await generatePDF(pdfHtml);

  const safeRef = (referenceNumber || jobId).replace(/[^a-zA-Z0-9_-]/g, "_");
  const s3Key = `job-completion-approvals/${jobId}/Job_Completion_Approval_${safeRef}.pdf`;
  const uploadResult = await uploadFile(s3Key, pdfBuffer, "application/pdf");
  if (!uploadResult?.success) {
    throw new Error("Failed to upload Job Completion Approval PDF");
  }

  // 4. Approver accepts/declines on the public /external page (Type=jobcompletion).
  const approveUrl = env.EMAIL?.FRONTEND_BASE_URL
    ? `${env.EMAIL.FRONTEND_BASE_URL}/external?Type=jobcompletion&id=${jobId}`
    : "#";

  const subject = `Job Completion Approval${referenceNumber ? ` – ${referenceNumber}` : ""}`;
  const html = wrapJobCompletionApprovalHTML({
    approverName: approver.name,
    approverRole,
    referenceNumber,
    customerName: lead.name,
    jobAddress,
    builderName: builder.name,
    pciDate,
    occupancyPermitDate,
    handoverDate,
    approveUrl,
    senderName: requestedByName || consultant.name || builder.name,
  });
  const plainText = `Dear ${approver.name || "Approver"}, approval is required to complete job `
    + `${referenceNumber || ""} at ${jobAddress || "the property"}. Review and accept here: ${approveUrl}`;

  await notificationQueue.add(
    {
      to: [approver.email],
      subject,
      text: plainText,
      html,
      attachments: [],
      cc: null,
      attachmentKeys: [
        { key: s3Key, filename: `Job_Completion_Approval_${safeRef}.pdf`, contentType: "application/pdf" },
      ],
    },
    {
      attempts: 3,
      backoff: { type: "exponential", delay: 10000 },
      removeOnComplete: true,
      removeOnFail: 50,
    },
  );

  await Notifications.create({
    sender_id: userId || null,
    receiver_info: JSON.stringify({ to: [approver.email], name: approver.name }),
    template_id: null,
    notification_type: "EMAIL",
    title: subject,
    body: `Job completion approval sent to ${approver.email} for job ${referenceNumber || jobId}`,
    metadata_json: JSON.stringify({ jobId, to: approver.email, s3Key }),
    delivery_status: "SENT",
  });

  console.log(`[JobCompletionApprovalWorker] Job complete — jobId: ${jobId}, to: ${approver.email}`);
  return { success: true, to: approver.email };
});

notificationQueue.on("failed", async (job, err) => {
  if (job.name !== "jobCompletionApproval") return;
  const { jobId, userId } = job.data;
  console.error(`[JobCompletionApprovalWorker] Job ${job.id} failed for jobId ${jobId}:`, err.message);

  if (job.attemptsMade >= job.opts.attempts) {
    try {
      const { Notifications } = db;
      await Notifications.create({
        sender_id: userId || null,
        receiver_info: JSON.stringify({ jobId }),
        template_id: null,
        notification_type: "EMAIL",
        title: "Job Completion Approval delivery failed",
        body: `Failed to send job completion approval for job ${jobId}`,
        metadata_json: JSON.stringify({ jobId, error: err.message }),
        delivery_status: "FAILED",
        failure_reason: err.message.slice(0, 500),
      });
    } catch (logErr) {
      console.error("[JobCompletionApprovalWorker] Failed to log failure to notifications table:", logErr.message);
    }
  }
});

notificationQueue.on("completed", (job, result) => {
  if (job.name !== "jobCompletionApproval") return;
  console.log(`[JobCompletionApprovalWorker] Job ${job.id} completed:`, result);
});

console.log("Job completion approval worker registered on notificationQueue...");

export default notificationQueue;
