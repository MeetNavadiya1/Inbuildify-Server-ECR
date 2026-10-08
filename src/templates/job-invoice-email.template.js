/**
 * Branded HTML body for the "Send Invoice to Customer" email.
 *
 * Mirrors the TAX INVOICE PDF the frontend renders (CRMSimplify
 * components/pdf/Invoice.tsx) so the emailed invoice reads as the same document
 * the customer gets attached — same accent colour, section order and wording.
 *
 * The PDF is @react-pdf/renderer (flexbox); email clients are not, so the layout
 * is rebuilt with tables and inline CSS only. No <style>/external CSS, no grid.
 */

const ACCENT = "#f59e0b";
const TEXT_DARK = "#1f2937";
const TEXT_MUTED = "#6b7280";
const BORDER = "#e5e7eb";
const DUE_RED = "#ef4444";
// The PDF renders in Helvetica; without an explicit stack email clients fall
// back to their default serif.
const FONT = "Helvetica, Arial, sans-serif";

function esc(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(n) {
  return `$${Number(n || 0).toFixed(2)}`;
}

function fallback(value, alt = "N/A") {
  const s = value === null || value === undefined ? "" : String(value).trim();
  return s || alt;
}

// The API returns DATEONLY columns as "2026-07-15"; the app shows dates as
// DD-MM-YYYY everywhere else, and so does the attached PDF — match it here so
// the emailed copy and the attachment read the same.
function fmtDate(value, alt = "N/A") {
  if (!value) return alt;
  const raw = String(value).slice(0, 10);
  const [y, m, d] = raw.split("-");
  if (!y || !m || !d) return fallback(value, alt);
  return `${d}-${m}-${y}`;
}

function totalsRow(label, value) {
  return `
        <tr>
          <td style="padding: 3px 0; font-size: 13px; color: ${TEXT_MUTED};">${esc(label)}</td>
          <td style="padding: 3px 0; font-size: 13px; color: ${TEXT_DARK}; text-align: right;">${esc(value)}</td>
        </tr>`;
}

/**
 * @param {object} opts
 * @param {object} opts.invoice  { referenceNumber, invoiceDate, dueDate, description, invoiceAmount }
 * @param {object} [opts.job]    { referenceNumber, customerName, jobAddress, customerPhone, customerEmail }
 * @param {object} [opts.company] { name, address1, address2, city, zipPostalCode, abnNumber,
 *                                  accountName, accountNumber, accountBsb, bankName, email }
 * @param {string} [opts.bodyHtml] optional user-authored message shown above the invoice
 * @returns {string} full HTML email
 */
export function wrapJobInvoiceEmailHTML({
  invoice = {},
  job = {},
  company = {},
  bodyHtml = "",
} = {}) {
  const amount = Number(invoice.invoiceAmount || 0);
  const invoiceRef = fallback(invoice.referenceNumber);
  const dueDate = fmtDate(invoice.dueDate);
  // Terms of 0 days mean there is no future deadline to quote — the invoice is
  // payable as soon as it lands.
  const dueLabel = invoice.dueDate ? dueDate : "Due on receipt";
  const termsLine = Number(invoice.termsDays) > 0
    ? `<div style="font-size:11px; color:${TEXT_MUTED}; margin-bottom:4px;">Terms: ${esc(Number(invoice.termsDays))} days</div>`
    : "";
  const overdueBadge = invoice.isOverdue
    ? `<div style="display:inline-block; margin-top:6px; padding:3px 10px; background-color:${DUE_RED}; color:#ffffff; font-size:10px; font-weight:bold; letter-spacing:0.5px; border-radius:3px;">OVERDUE</div>`
    : "";

  const companyStreet = [company.address1, company.address2].filter(Boolean).join(", ");
  const companyCity = [company.city, company.zipPostalCode].filter(Boolean).join(", ");

  // The send panel's Message field is a rich-text editor (HTML), but its default
  // value is a plain string with "\n" breaks — sending without editing would
  // otherwise collapse into one run-on paragraph.
  const raw = String(bodyHtml || "").trim();
  const message = !raw || /<[a-z][^>]*>/i.test(raw)
    ? raw
    : `<div style="white-space: pre-wrap;">${esc(raw)}</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0; padding:0; background-color:#f3f4f6; font-family:${FONT};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6; padding:24px 12px; font-family:${FONT};">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:6px; padding:32px; font-family:${FONT};">

          <!-- Header -->
          <tr>
            <td>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <!-- Wordmark, not the PDF's /company-light.png: that asset is a
                       frontend-relative path with no public URL, and a broken <img>
                       reads worse than text in an inbox. The tenant company is the
                       FROM block, so this stays the product brand as in the PDF. -->
                  <td style="font-size:22px; font-weight:bold; color:${TEXT_DARK}; letter-spacing:-0.5px; vertical-align:top;">In<span style="color:${ACCENT};">Buildify</span></td>
                  <td style="text-align:right; vertical-align:top;">
                    <div style="font-size:22px; font-weight:bold; color:${ACCENT}; letter-spacing:1px; margin-bottom:8px;">TAX INVOICE</div>
                    <div style="font-size:11px; color:${TEXT_MUTED}; margin-bottom:4px;">Invoice No: ${esc(invoiceRef)}</div>
                    <div style="font-size:11px; color:${TEXT_MUTED}; margin-bottom:4px;">Invoice Date: ${esc(fmtDate(invoice.invoiceDate))}</div>
                    ${termsLine}
                    <div style="font-size:11px; color:${TEXT_MUTED};">Payment Due: ${esc(dueLabel)}</div>
                    ${overdueBadge}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
${message ? `
          <!-- Optional user-authored message -->
          <tr>
            <td style="padding-top:28px; font-size:14px; color:${TEXT_DARK}; line-height:1.6;">${message}</td>
          </tr>` : ""}

          <!-- Billed to / From -->
          <tr>
            <td style="padding-top:32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:top; width:50%;">
                    <div style="font-size:10px; font-weight:bold; color:${TEXT_MUTED}; text-transform:uppercase; margin-bottom:6px;">Billed To:</div>
                    <div style="font-size:12px; font-weight:bold; color:${TEXT_DARK}; margin-bottom:3px;">${esc(fallback(job.customerName))}</div>
                    <div style="font-size:11px; color:${TEXT_MUTED}; margin-bottom:3px;">${esc(fallback(job.jobAddress))}</div>
                    <div style="font-size:11px; color:${TEXT_MUTED}; margin-bottom:3px;">${esc(fallback(job.customerPhone))}</div>
                    <div style="font-size:11px; color:${TEXT_MUTED};">${esc(fallback(job.customerEmail))}</div>
                  </td>
                  <td style="vertical-align:top; width:50%; text-align:right;">
                    <div style="font-size:10px; font-weight:bold; color:${TEXT_MUTED}; text-transform:uppercase; margin-bottom:6px;">From:</div>
                    <div style="font-size:12px; font-weight:bold; color:${TEXT_DARK}; margin-bottom:3px;">${esc(fallback(company.name, "Company Name"))}</div>
                    ${companyStreet ? `<div style="font-size:11px; color:${TEXT_MUTED}; margin-bottom:3px;">${esc(companyStreet)}</div>` : ""}
                    ${companyCity ? `<div style="font-size:11px; color:${TEXT_MUTED}; margin-bottom:3px;">${esc(companyCity)}</div>` : ""}
                    <div style="font-size:11px; color:${TEXT_MUTED};">ABN : ${esc(fallback(company.abnNumber))}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Divider -->
          <tr><td style="padding-top:28px;"><div style="border-top:1px solid ${BORDER}; font-size:0; line-height:0;">&nbsp;</div></td></tr>

          <!-- Job / Invoice refs -->
          <tr>
            <td style="padding-top:20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb; border-radius:4px;">
                <tr>
                  <td style="padding:10px; font-size:11px; font-weight:bold; color:${TEXT_DARK};">Job Ref: ${esc(fallback(job.referenceNumber))}</td>
                  <td style="padding:10px; font-size:11px; font-weight:bold; color:${TEXT_DARK}; text-align:right;">Invoice Ref: ${esc(invoiceRef)}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Line items -->
          <tr>
            <td style="padding-top:24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-bottom:8px; border-bottom:2px solid ${ACCENT}; font-size:11px; font-weight:bold; color:${TEXT_DARK};">Description</td>
                  <td style="padding-bottom:8px; border-bottom:2px solid ${ACCENT}; font-size:11px; font-weight:bold; color:${TEXT_DARK}; text-align:right;">Amount</td>
                </tr>
                <tr>
                  <td style="padding:12px 0; border-bottom:1px solid ${BORDER}; font-size:12px; color:${TEXT_DARK};">${esc(fallback(invoice.description))}</td>
                  <td style="padding:12px 0; border-bottom:1px solid ${BORDER}; font-size:12px; font-weight:bold; color:${TEXT_DARK}; text-align:right;">${esc(money(amount))}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Totals -->
          <tr>
            <td style="padding-top:20px;" align="right">
              <table role="presentation" width="240" cellpadding="0" cellspacing="0">
${totalsRow("SubTotal:", money(amount))}
${totalsRow("GST:", money(0))}
                <tr>
                  <td style="padding-top:10px; border-top:1px solid ${BORDER}; font-size:13px; font-weight:bold; color:${TEXT_DARK};">TOTAL DUE</td>
                  <td style="padding-top:10px; border-top:1px solid ${BORDER}; font-size:17px; font-weight:bold; color:${ACCENT}; text-align:right;">${esc(money(amount))}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Bank details -->
          <tr>
            <td style="padding-top:36px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc; border-left:3px solid ${ACCENT}; border-radius:4px;">
                <tr>
                  <td style="padding:15px;">
                    <div style="font-size:11px; font-weight:bold; color:${TEXT_DARK}; margin-bottom:4px;">Please credit funds direct to the following account details:</div>
                    <div style="font-size:10px; color:${TEXT_MUTED};">A/C Name : ${esc(fallback(company.accountName))}, A/C No : ${esc(fallback(company.accountNumber))}, BSB : ${esc(fallback(company.accountBsb))}</div>
                    <div style="font-size:10px; color:${TEXT_MUTED};">Bank : ${esc(fallback(company.bankName))}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Payment terms -->
          <tr>
            <td style="padding:15px 0 0 15px;">
              <div style="font-size:11px; font-weight:bold; color:${TEXT_DARK}; margin-bottom:4px;">Payment Terms</div>
              <div style="font-size:10px; color:${TEXT_MUTED}; line-height:1.4;">Payment is strictly due by <span style="font-weight:bold; color:${DUE_RED};">${esc(dueLabel)}</span>. Please ensure your payment is processed by this date to avoid any late fees.</div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:44px;">
              <div style="border-top:1px solid ${BORDER}; padding-top:15px; text-align:center;">
                <div style="font-size:13px; font-weight:bold; color:${TEXT_DARK}; margin-bottom:5px;">Thank you for your business!</div>
                <div style="font-size:10px; color:${TEXT_MUTED};">If you have any questions about this invoice, please contact us at ${esc(fallback(company.email, "support"))}</div>
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Plain-text fallback mirroring the HTML body, for clients that strip HTML.
 */
export function buildJobInvoicePlainText({ invoice = {}, job = {}, company = {} } = {}) {
  const dueLabel = invoice.dueDate ? fmtDate(invoice.dueDate) : "Due on receipt";
  return [
    `TAX INVOICE ${fallback(invoice.referenceNumber)}${invoice.isOverdue ? " (OVERDUE)" : ""}`,
    `Invoice Date: ${fmtDate(invoice.invoiceDate)}`,
    ...(Number(invoice.termsDays) > 0 ? [`Terms: ${Number(invoice.termsDays)} days`] : []),
    `Payment Due: ${dueLabel}`,
    "",
    `Billed To: ${fallback(job.customerName)}`,
    `Job Ref: ${fallback(job.referenceNumber)}`,
    "",
    `${fallback(invoice.description)} — ${money(invoice.invoiceAmount)}`,
    `Total Due: ${money(invoice.invoiceAmount)}`,
    "",
    `Payment is strictly due by ${dueLabel}.`,
    `A/C Name: ${fallback(company.accountName)}, A/C No: ${fallback(company.accountNumber)}, BSB: ${fallback(company.accountBsb)}`,
    `Bank: ${fallback(company.bankName)}`,
  ].join("\n");
}

export default { wrapJobInvoiceEmailHTML, buildJobInvoicePlainText };
