/**
 * Templates for the Job "Commencement Letter" email.
 *
 * Two pieces, mirroring the engineer-email flow:
 *   1. wrapCommencementLetterHTML — branded wrapper that produces a structured
 *      "Notice of Commencement" email. Inline CSS only — mail clients ignore
 *      <style>/external CSS.
 *   2. generateCommencementLetterPdfHtml — the "Job Pdf" body that Puppeteer
 *      renders into the PDF attached to the email.
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

function val(value) {
  if (value === 0) return "0";
  if (value === null || value === undefined) return PLACEHOLDER;
  const str = String(value).trim();
  return str.length ? escapeHtml(str) : PLACEHOLDER;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const esc = escapeHtml;

/**
 * One row in the Job Details card: label on the left, value on the right.
 * Supports an optional email link on the value side.
 */
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
 * Branded HTML wrapper — Notice of Commencement email.
 *
 * @param {object} opts
 * @param {string}  opts.customerName           Recipient name, e.g. "Joshua Ewing"
 * @param {string}  opts.ownerName              Owner full name
 * @param {string}  opts.ownerEmail             Owner email address
 * @param {string}  opts.contractorName         Contractor / builder name
 * @param {string}  opts.contractorEmail        Contractor email address
 * @param {string}  opts.contractDate           e.g. "15 June 2026"
 * @param {string}  opts.jobAddress             Full job site address
 * @param {string}  opts.practicalCompletionDate e.g. "30 November 2026"
 * @param {string}  opts.acknowledgeUrl         URL for the "Acknowledge Receipt" button
 * @param {string}  opts.senderName             Sign-off name, e.g. "Kishan"
 * @param {string}  [opts.extraNote]            Optional extra paragraph before sign-off
 * @returns {string} full HTML email string
 */
export function wrapCommencementLetterHTML({
  customerName = "",
  ownerName = "",
  ownerEmail = "",
  contractorName = "",
  contractorEmail = "",
  contractDate = "",
  jobAddress = "",
  practicalCompletionDate = "",
  acknowledgeUrl = "#",
  senderName = "",
  extraNote = "",
} = {}) {

  const jobRows = [
    detailRow("Owner", ownerName, ownerEmail),
    detailRow("Contractor", contractorName, contractorEmail),
    detailRow("Contract Date", contractDate || "[Insert Contract Date]"),
    detailRow("Job Address", jobAddress),
    detailRow("Expected Practical Completion Date", practicalCompletionDate || "[Insert Practical Completion Date]", null, true),
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
                <td style="text-align: right;"><span style="font-size: 11px; font-weight: 700; color: #b3d7ff; text-transform: uppercase; letter-spacing: 1px; background-color: rgba(255,255,255,0.15); padding: 4px 10px; border-radius: 4px;">Commencement Letter</span></td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ── Body ── -->
        <tr>
          <td style="padding: 36px 40px 30px;">

            <!-- Greeting -->
            <p style="font-size: 15px; color: #475569; margin: 0 0 6px;">Dear ${esc(customerName)},</p>

            <!-- Section heading -->
            <h2 style="font-size: 18px; font-weight: 700; color: #1e293b; margin: 20px 0 10px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">Notice of Commencement</h2>

            <!-- Intro paragraph -->
            <p style="font-size: 14px; color: #475569; line-height: 1.7; margin: 0 0 24px;">
              We are pleased to inform you that work has commenced at the property listed below.
              This notice serves as confirmation that the project has officially started.
              The anticipated date of Practical Completion is outlined in the project details below.
            </p>

            <!-- Job Details card -->
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

            <!-- Practical completion note -->
            <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin: 0 0 24px;">
              Please note that the Practical Completion Date may be adjusted in accordance with the terms and
              conditions of the contract and any circumstances affecting the progress of the works.
            </p>

            <!-- Acknowledge button -->
            <p style="font-size: 14px; color: #475569; margin: 0 0 16px;">
              To acknowledge receipt of this notice, please click the link below:
            </p>
            <table border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 28px;">
              <tr>
                <td style="background-color: #2563eb; border-radius: 6px; padding: 12px 28px;">
                  <a href="${esc(acknowledgeUrl)}" style="font-size: 14px; font-weight: 700; color: #ffffff; text-decoration: none; display: inline-block;">Acknowledge Receipt</a>
                </td>
              </tr>
            </table>

            ${extraNote ? `<p style="font-size: 13px; color: #64748b; line-height: 1.6; margin: 0 0 24px;">${esc(extraNote)}</p>` : ""}

            <!-- Sign-off -->
            <p style="font-size: 14px; color: #475569; margin: 0 0 4px;">Regards,</p>
            ${senderName ? `<p style="font-size: 14px; font-weight: 600; color: #1e293b; margin: 0;">${esc(senderName)}</p>` : ""}

            <p style="font-size: 13px; color: #94a3b8; margin: 24px 0 0;">The Commencement Letter PDF is attached to this email.</p>
          </td>
        </tr>

        <!-- ── Footer ── -->
        <tr>
          <td style="background-color: #f8fafc; padding: 24px 40px; text-align: center; border-top: 1px solid #eef2f5;">
            <p style="font-size: 12px; color: #94a3b8; margin: 0 0 6px;">This email relates to the commencement of your building works. The official letter is attached as a PDF.</p>
            <p style="font-size: 12px; font-weight: 600; color: #64748b; margin: 0;"><strong>inBuildify</strong> | Modern Construction &amp; CRM Solutions</p>
          </td>
        </tr>

      </table>
    </div>`;
}

/**
 * Branded confirmation email sent to the customer when they acknowledge the
 * Commencement Notice ("Email me a copy of this response"). Matches the
 * inBuildify header/footer layout of wrapCommencementLetterHTML. Inline CSS only.
 *
 * @param {object} opts
 * @param {string}  opts.customerName     Recipient name
 * @param {string}  opts.decision         "ACCEPTED" | "DECLINED"
 * @param {string}  [opts.comments]       Optional comments the customer left
 * @param {string}  [opts.referenceNumber] Job reference
 * @param {string}  [opts.jobAddress]     Job site address
 * @returns {string} full HTML email string
 */
export function wrapCommencementAckHTML({
  customerName = "",
  decision = "ACCEPTED",
  comments = "",
  referenceNumber = "",
  jobAddress = "",
} = {}) {
  const accepted = decision === "ACCEPTED";
  const verb = accepted ? "accepted" : "declined";
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

        <!-- ── Header ── -->
        <tr>
          <td style="background-color: #2563eb; padding: 28px 40px;">
            <table border="0" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td><span style="font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">inBuildify</span></td>
                <td style="text-align: right;"><span style="font-size: 11px; font-weight: 700; color: #b3d7ff; text-transform: uppercase; letter-spacing: 1px; background-color: rgba(255,255,255,0.15); padding: 4px 10px; border-radius: 4px;">Acknowledgment</span></td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ── Body ── -->
        <tr>
          <td style="padding: 36px 40px 30px;">
            <p style="font-size: 15px; color: #475569; margin: 0 0 16px;">Dear ${esc(customerName) || "Customer"},</p>

            <p style="font-size: 14px; color: #475569; line-height: 1.7; margin: 0 0 20px;">
              This confirms that you have
              <span style="display: inline-block; background-color: ${statusBg}; color: ${statusColor}; font-weight: 700; padding: 2px 10px; border-radius: 4px; font-size: 13px;">${statusLabel}</span>
              the construction commencement notice${referenceNumber ? ` for job <strong>${esc(referenceNumber)}</strong>` : ""}.
            </p>

            ${detailsCard}
            ${commentsCard}

            <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin: 0 0 4px;">
              If anything looks incorrect, please contact your consultant.
            </p>

            <p style="font-size: 14px; color: #475569; margin: 24px 0 4px;">Kind regards,</p>
            <p style="font-size: 14px; font-weight: 600; color: #1e293b; margin: 0;">The inBuildify Team</p>
          </td>
        </tr>

        <!-- ── Footer ── -->
        <tr>
          <td style="background-color: #f8fafc; padding: 24px 40px; text-align: center; border-top: 1px solid #eef2f5;">
            <p style="font-size: 12px; color: #94a3b8; margin: 0 0 6px;">This is a copy of your response to the commencement notice${verb ? ` (${verb})` : ""}.</p>
            <p style="font-size: 12px; font-weight: 600; color: #64748b; margin: 0;"><strong>inBuildify</strong> | Modern Construction &amp; CRM Solutions</p>
          </td>
        </tr>

      </table>
    </div>`;
}

// ─── PDF helpers (matching Engineering Requirement style) ────────────────────

function field(label, value, highlight = false) {
  const valueColor = highlight ? "#2563eb" : "#1e293b";
  const valueWeight = highlight ? "700" : "600";
  return `
    <li style="display: flex; justify-content: space-between; padding: 8px 0; font-size: 13px; border-bottom: 1px dashed #e2e8f0;">
      <span style="font-weight: 500; color: #64748b;">${escapeHtml(label)}</span>
      <span style="font-weight: ${valueWeight}; color: ${valueColor}; text-align: right;">${val(value)}</span>
    </li>`;
}

function section(title, innerHtml) {
  return `
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px 20px; margin-bottom: 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
      <h3 style="font-size: 14px; font-weight: 700; color: #0f172a; margin: 0 0 12px 0; border-bottom: 1px solid #cbd5e1; padding-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">${escapeHtml(title)}</h3>
      <ul style="list-style: none; padding: 0; margin: 0;">
        ${innerHtml}
      </ul>
    </div>`;
}

function heading(text) {
  return `
    <div style="margin-top: 30px; margin-bottom: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; page-break-after: avoid;">
      <h2 style="font-size: 15px; font-weight: 700; color: #2563eb; margin: 0; text-transform: uppercase; letter-spacing: 1px;">${escapeHtml(text)}</h2>
    </div>`;
}

/**
 * Build the HTML that Puppeteer renders into the attached Commencement Letter PDF.
 *
 * @param {object} data {
 *   referenceNumber, customerName, jobAddress, builderName,
 *   consultantName, estateName, titleDate, quotationTotal,
 *   ownerEmail, contractorEmail, contractDate, practicalCompletionDate,
 *   jobNote, message, date
 * }
 * @returns {string} full HTML document
 */
export function generateCommencementLetterPdfHtml(data = {}) {
  const {
    referenceNumber,
    customerName,
    jobAddress,
    builderName,
    consultantName,
    estateName,
    titleDate,
    quotationTotal,
    ownerEmail,
    contractorEmail,
    contractDate,
    practicalCompletionDate,
    jobNote,
    message,
    date,
  } = data;

  const money = (v) =>
    v === null || v === undefined || v === ""
      ? null
      : `$${Number(v).toLocaleString("en-AU")}`;

  // Header meta lines — rendered only when present, preserving the original
  // "Date" / "Reference" conditional behaviour of the previous header block.
  const metaHtml =
    (date ? docMetaLine("Date", date) : "") +
    (referenceNumber ? docMetaLine("Reference", referenceNumber) : "");

  // Job Information — every field always renders, using the "—" placeholder for
  // empty values exactly as before. val() already escapes, so pass raw to avoid
  // double-escaping; the highlighted Quotation Total uses the family amber accent.
  const jobInfoCard = card({
    title: "Job Information",
    bodyHtml: infoList(
      infoRow("Job Reference", val(referenceNumber), { raw: true }) +
        infoRow("Customer", val(customerName), { raw: true }) +
        infoRow("Owner Email", val(ownerEmail), { raw: true }) +
        infoRow("Job Address", val(jobAddress), { raw: true }) +
        infoRow("Estate", val(estateName), { raw: true }) +
        infoRow("Title Date", val(titleDate), { raw: true }) +
        infoRow("Contract Date", val(contractDate), { raw: true }) +
        infoRow("Expected Practical Completion", val(practicalCompletionDate), { raw: true }) +
        infoRow("Builder", val(builderName), { raw: true }) +
        infoRow("Builder Email", val(contractorEmail), { raw: true }) +
        infoRow("Consultant", val(consultantName), { raw: true }) +
        infoRow("Quotation Total", val(money(quotationTotal)), { raw: true, accent: true }),
    ),
  });

  // Optional free-text message (raw HTML, kept verbatim as before).
  const messageBlock = message
    ? `${sectionHeader("2. Message")}${card({
        bodyHtml: `<div style="font-size:11px; line-height:1.7; color:var(--dark);">${message}</div>`,
      })}`
    : "";

  // Optional job note (escaped, kept verbatim as before). The heading number
  // tracks whether the Message section rendered — identical to the prior logic.
  const jobNoteBlock = jobNote
    ? `${sectionHeader(message ? "3. Job Note" : "2. Job Note")}${card({
        tight: true,
        bodyHtml: `<div style="font-size:10.5px; line-height:1.6; color:var(--muted);">${escapeHtml(jobNote)}</div>`,
      })}`
    : "";

  const bodyHtml = `
    ${brandHeader({
      logoHtml: brandLogoHtml(),
      title: "Commencement Letter",
      metaHtml,
    })}
    ${pdfDivider()}

    ${sectionHeader("1. Job Details")}
    ${jobInfoCard}

    ${messageBlock}
    ${jobNoteBlock}

    <div style="margin-top: 30px; text-align: center;">
      <div style="font-size: 10px; color: var(--muted);">
        This Commencement Letter is generated by inBuildify. For any queries please contact your consultant${consultantName ? ` (${escapeHtml(consultantName)})` : ""}.
      </div>
    </div>

    ${pdfFooter({ title: "InBuildify", note: "Commencement Letter" })}
  `;

  return renderPdfDocument({ title: "Commencement Letter", bodyHtml });
}

export default { wrapCommencementLetterHTML, wrapCommencementAckHTML, generateCommencementLetterPdfHtml };
