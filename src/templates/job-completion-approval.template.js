/**
 * Templates for the Job "Complete Job" approval request.
 *
 * Mirrors the commencement-letter flow:
 *   1. wrapJobCompletionApprovalHTML — branded email sent to the selected
 *      Company Administrator / Site Supervisor, carrying the Accept link.
 *      Inline CSS only — mail clients ignore <style>/external CSS.
 *   2. generateJobCompletionApprovalPdfHtml — the body Puppeteer renders into
 *      the PDF attached to that email (same design system as the quotation PDF).
 *   3. wrapJobCompletionApprovalResponseHTML — copy of the approver's response.
 */

import {
  renderPdfDocument,
  brandHeader,
  brandLogoHtml,
  pdfDivider,
  sectionHeader,
  card,
  infoList,
  infoRow,
  docMetaLine,
  pdfFooter,
} from "../utils/pdfDesignSystem.js";

const PLACEHOLDER = "—";

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const esc = escapeHtml;

function val(value) {
  if (value === 0) return "0";
  if (value === null || value === undefined) return PLACEHOLDER;
  const str = String(value).trim();
  return str.length ? escapeHtml(str) : PLACEHOLDER;
}

function detailRow(label, value, emailLink = null, last = false) {
  if (!value && !emailLink) return "";
  const borderBottom = last ? "none" : "1px solid #f1f5f9";
  const valueHtml = emailLink
    ? `${esc(value || "")} <a href="mailto:${esc(emailLink)}" style="color: #2563eb; text-decoration: none; font-size: 12px; margin-left: 6px;">${esc(emailLink)}</a>`
    : esc(value || "");
  return `
    <tr>
      <td style="padding: 10px 0; font-size: 13px; color: #64748b; border-bottom: ${borderBottom}; vertical-align: top; width: 42%; padding-right: 16px;">${esc(label)}</td>
      <td style="padding: 10px 0; font-size: 13px; font-weight: 600; color: #1e293b; border-bottom: ${borderBottom}; vertical-align: top;">${valueHtml}</td>
    </tr>`;
}

/**
 * Branded HTML wrapper — "Job Completion Approval" request email.
 *
 * @param {object} opts
 * @param {string} opts.approverName    Recipient (Company Administrator / Site Supervisor)
 * @param {string} opts.approverRole    Role name shown as the reason they were asked
 * @param {string} opts.referenceNumber Job reference, e.g. "LD20260007"
 * @param {string} opts.customerName    Homebuyer name
 * @param {string} opts.jobAddress      Full job site address
 * @param {string} opts.builderName     Builder / contractor name
 * @param {string} opts.pciDate         PCI date (already formatted)
 * @param {string} opts.occupancyPermitDate Occupancy permit date (already formatted)
 * @param {string} opts.handoverDate    Handover date (already formatted)
 * @param {string} opts.approveUrl      URL of the public accept/decline page
 * @param {string} opts.senderName      Sign-off name (the user who requested it)
 * @returns {string} full HTML email string
 */
export function wrapJobCompletionApprovalHTML({
  approverName = "",
  approverRole = "",
  referenceNumber = "",
  customerName = "",
  jobAddress = "",
  builderName = "",
  pciDate = "",
  occupancyPermitDate = "",
  handoverDate = "",
  approveUrl = "#",
  senderName = "",
} = {}) {
  const jobRows = [
    detailRow("Job Reference", referenceNumber),
    detailRow("Customer", customerName),
    detailRow("Job Address", jobAddress),
    detailRow("Builder", builderName),
    detailRow("PCI Date", pciDate),
    detailRow("Occupancy Permit Date", occupancyPermitDate),
    detailRow("Handover Date", handoverDate, null, true),
  ].join("");

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f6f9fc; padding: 40px 10px; margin: 0;">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid #eef2f5;">

        <!-- ── Header ── -->
        <tr>
          <td style="background-color: #2563eb; padding: 28px 40px;">
            <table border="0" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td><span style="font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">inBuildify</span></td>
                <td style="text-align: right;"><span style="font-size: 11px; font-weight: 700; color: #b3d7ff; text-transform: uppercase; letter-spacing: 1px; background-color: rgba(255,255,255,0.15); padding: 4px 10px; border-radius: 4px;">Job Completion Approval</span></td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ── Body ── -->
        <tr>
          <td style="padding: 36px 40px 30px;">

            <p style="font-size: 15px; color: #475569; margin: 0 0 6px;">Dear ${esc(approverName) || "Approver"},</p>

            <h2 style="font-size: 18px; font-weight: 700; color: #1e293b; margin: 20px 0 10px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">Approval Required — Complete Job</h2>

            <p style="font-size: 14px; color: #475569; line-height: 1.7; margin: 0 0 24px;">
              A request has been raised to mark the construction job below as completed${referenceNumber ? ` (<strong>${esc(referenceNumber)}</strong>)` : ""}.
              You have been nominated as the approver${approverRole ? ` in your capacity as <strong>${esc(approverRole)}</strong>` : ""}.
              The job can only be closed and moved to Maintenance once you accept this request.
            </p>

            <div style="background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 24px; overflow: hidden;">
              <div style="background-color: #f1f5f9; padding: 11px 20px; border-bottom: 1px solid #e2e8f0;">
                <strong style="font-size: 12px; color: #1e293b; text-transform: uppercase; letter-spacing: 0.6px;">Job Details</strong>
              </div>
              <div style="padding: 4px 20px 8px;">
                <table border="0" cellpadding="0" cellspacing="0" width="100%">
                  ${jobRows}
                </table>
              </div>
            </div>

            <p style="font-size: 14px; color: #475569; margin: 0 0 16px;">
              Please review the attached Job Completion Approval PDF and record your decision:
            </p>
            <table border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 28px;">
              <tr>
                <td style="background-color: #2563eb; border-radius: 6px; padding: 12px 28px;">
                  <a href="${esc(approveUrl)}" style="font-size: 14px; font-weight: 700; color: #ffffff; text-decoration: none; display: inline-block;">Review &amp; Accept</a>
                </td>
              </tr>
            </table>

            <p style="font-size: 14px; color: #475569; margin: 0 0 4px;">Regards,</p>
            ${senderName ? `<p style="font-size: 14px; font-weight: 600; color: #1e293b; margin: 0;">${esc(senderName)}</p>` : ""}

            <p style="font-size: 13px; color: #94a3b8; margin: 24px 0 0;">The Job Completion Approval PDF is attached to this email.</p>
          </td>
        </tr>

        <!-- ── Footer ── -->
        <tr>
          <td style="background-color: #f8fafc; padding: 24px 40px; text-align: center; border-top: 1px solid #eef2f5;">
            <p style="font-size: 12px; color: #94a3b8; margin: 0 0 6px;">This email relates to the completion of a construction job. The approval document is attached as a PDF.</p>
            <p style="font-size: 12px; font-weight: 600; color: #64748b; margin: 0;"><strong>inBuildify</strong> | Modern Construction &amp; CRM Solutions</p>
          </td>
        </tr>

      </table>
    </div>`;
}

/**
 * Confirmation email sent back to the approver when they accept/decline
 * ("Email me a copy of this response").
 */
export function wrapJobCompletionApprovalResponseHTML({
  approverName = "",
  decision = "ACCEPTED",
  comments = "",
  referenceNumber = "",
  jobAddress = "",
} = {}) {
  const accepted = decision === "ACCEPTED";
  const statusLabel = accepted ? "Accepted" : "Declined";
  const statusColor = accepted ? "#16a34a" : "#dc2626";
  const statusBg = accepted ? "#dcfce7" : "#fee2e2";

  const detailRows = [
    detailRow("Reference", referenceNumber),
    detailRow("Job Address", jobAddress, null, true),
  ].join("");

  const detailsCard = detailRows
    ? `
            <div style="background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 24px; overflow: hidden;">
              <div style="background-color: #f1f5f9; padding: 11px 20px; border-bottom: 1px solid #e2e8f0;">
                <strong style="font-size: 12px; color: #1e293b; text-transform: uppercase; letter-spacing: 0.6px;">Job Details</strong>
              </div>
              <div style="padding: 4px 20px 8px;">
                <table border="0" cellpadding="0" cellspacing="0" width="100%">${detailRows}</table>
              </div>
            </div>`
    : "";

  const commentsCard = comments
    ? `
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; margin-bottom: 24px;">
              <div style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 6px;">Your Comments</div>
              <div style="font-size: 14px; color: #334155; line-height: 1.6;">${esc(comments)}</div>
            </div>`
    : "";

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f6f9fc; padding: 40px 10px; margin: 0;">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid #eef2f5;">

        <tr>
          <td style="background-color: #2563eb; padding: 28px 40px;">
            <table border="0" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td><span style="font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">inBuildify</span></td>
                <td style="text-align: right;"><span style="font-size: 11px; font-weight: 700; color: #b3d7ff; text-transform: uppercase; letter-spacing: 1px; background-color: rgba(255,255,255,0.15); padding: 4px 10px; border-radius: 4px;">Approval Response</span></td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding: 36px 40px 30px;">
            <p style="font-size: 15px; color: #475569; margin: 0 0 16px;">Dear ${esc(approverName) || "Approver"},</p>

            <p style="font-size: 14px; color: #475569; line-height: 1.7; margin: 0 0 20px;">
              This confirms that you have
              <span style="display: inline-block; background-color: ${statusBg}; color: ${statusColor}; font-weight: 700; padding: 2px 10px; border-radius: 4px; font-size: 13px;">${statusLabel}</span>
              the job completion request${referenceNumber ? ` for job <strong>${esc(referenceNumber)}</strong>` : ""}.
            </p>

            ${detailsCard}
            ${commentsCard}

            <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin: 0 0 4px;">
              If anything looks incorrect, please contact the builder.
            </p>

            <p style="font-size: 14px; color: #475569; margin: 24px 0 4px;">Kind regards,</p>
            <p style="font-size: 14px; font-weight: 600; color: #1e293b; margin: 0;">The inBuildify Team</p>
          </td>
        </tr>

        <tr>
          <td style="background-color: #f8fafc; padding: 24px 40px; text-align: center; border-top: 1px solid #eef2f5;">
            <p style="font-size: 12px; color: #94a3b8; margin: 0 0 6px;">This is a copy of your response to the job completion request.</p>
            <p style="font-size: 12px; font-weight: 600; color: #64748b; margin: 0;"><strong>inBuildify</strong> | Modern Construction &amp; CRM Solutions</p>
          </td>
        </tr>

      </table>
    </div>`;
}

/**
 * Build the HTML that Puppeteer renders into the attached Job Completion
 * Approval PDF. Same design system as the quotation / commencement PDFs.
 *
 * @param {object} data {
 *   referenceNumber, customerName, jobAddress, builderName, consultantName,
 *   estateName, approverName, approverRole, approverEmail, requestedBy,
 *   pciDate, occupancyPermitDate, handoverDate, quotationTotal, jobNote, date
 * }
 * @returns {string} full HTML document
 */
export function generateJobCompletionApprovalPdfHtml(data = {}) {
  const {
    referenceNumber,
    customerName,
    jobAddress,
    builderName,
    consultantName,
    estateName,
    approverName,
    approverRole,
    approverEmail,
    requestedBy,
    pciDate,
    occupancyPermitDate,
    handoverDate,
    quotationTotal,
    jobNote,
    date,
  } = data;

  const money = (v) =>
    v === null || v === undefined || v === ""
      ? null
      : `$${Number(v).toLocaleString("en-AU")}`;

  const metaHtml =
    (date ? docMetaLine("Date", date) : "") +
    (referenceNumber ? docMetaLine("Reference", referenceNumber) : "");

  const jobInfoCard = card({
    title: "Job Information",
    bodyHtml: infoList(
      infoRow("Job Reference", val(referenceNumber), { raw: true }) +
        infoRow("Customer", val(customerName), { raw: true }) +
        infoRow("Job Address", val(jobAddress), { raw: true }) +
        infoRow("Estate", val(estateName), { raw: true }) +
        infoRow("Builder", val(builderName), { raw: true }) +
        infoRow("Consultant", val(consultantName), { raw: true }) +
        infoRow("Quotation Total", val(money(quotationTotal)), { raw: true, accent: true }),
    ),
  });

  const handoverCard = card({
    title: "Handover Details",
    bodyHtml: infoList(
      infoRow("PCI Date", val(pciDate), { raw: true }) +
        infoRow("Occupancy Permit Date", val(occupancyPermitDate), { raw: true }) +
        infoRow("Handover Date", val(handoverDate), { raw: true, accent: true }),
    ),
  });

  const approvalCard = card({
    title: "Approval",
    bodyHtml: infoList(
      infoRow("Approver", val(approverName), { raw: true }) +
        infoRow("Role", val(approverRole), { raw: true }) +
        infoRow("Email", val(approverEmail), { raw: true }) +
        infoRow("Requested By", val(requestedBy), { raw: true }),
    ),
  });

  const jobNoteBlock = jobNote
    ? `${sectionHeader("4. Job Note")}${card({
        tight: true,
        bodyHtml: `<div style="font-size:10.5px; line-height:1.6; color:var(--muted);">${escapeHtml(jobNote)}</div>`,
      })}`
    : "";

  const bodyHtml = `
    ${brandHeader({
      logoHtml: brandLogoHtml(),
      title: "Job Completion Approval",
      metaHtml,
    })}
    ${pdfDivider()}

    ${sectionHeader("1. Job Details")}
    ${jobInfoCard}

    ${sectionHeader("2. Handover Details")}
    ${handoverCard}

    ${sectionHeader("3. Approval")}
    ${approvalCard}

    ${jobNoteBlock}

    <div style="margin-top: 30px; text-align: center;">
      <div style="font-size: 10px; color: var(--muted);">
        This job will be marked as completed and moved to Maintenance only after the nominated approver accepts this request.
      </div>
    </div>

    ${pdfFooter({ title: "InBuildify", note: "Job Completion Approval" })}
  `;

  return renderPdfDocument({ title: "Job Completion Approval", bodyHtml });
}

export default {
  wrapJobCompletionApprovalHTML,
  wrapJobCompletionApprovalResponseHTML,
  generateJobCompletionApprovalPdfHtml,
};
