/**
 * Template for the "customer sent their colours to the builder" email.
 *
 * Raised by the homebuyer's own My Colours page (PUT /job/my/tracking/colours):
 * the customer picks their items and presses "Send to builder", and this is what
 * lands in the consultant's / site supervisor's inbox. The colour-selection PDF
 * is attached by colorEmailWorker, so the body stays a readable summary rather
 * than trying to reproduce the whole schedule.
 *
 * Inline CSS only — mail clients ignore <style>/external CSS. Same design as the
 * other job emails (see job-completion-approval.template.js).
 */

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
  if (value === 0) {
    return "0";
  }
  if (value === null || value === undefined) {
    return PLACEHOLDER;
  }
  const str = String(value).trim();
  return str.length ? escapeHtml(str) : PLACEHOLDER;
}

function detailRow(label, value, last = false) {
  if (!value) {
    return "";
  }
  const borderBottom = last ? "none" : "1px solid #f1f5f9";
  return `
    <tr>
      <td style="padding: 10px 0; font-size: 13px; color: #64748b; border-bottom: ${borderBottom}; vertical-align: top; width: 42%; padding-right: 16px;">${esc(label)}</td>
      <td style="padding: 10px 0; font-size: 13px; font-weight: 600; color: #1e293b; border-bottom: ${borderBottom}; vertical-align: top;">${esc(value)}</td>
    </tr>`;
}

/** One item line: name on top, code / upgrade option / quantity underneath. */
function itemRow(item, showPrices, last) {
  const borderBottom = last ? "none" : "1px solid #f1f5f9";
  const meta = [
    item.itemCode ? `Code ${item.itemCode}` : null,
    item.supplierName || null,
    item.upgradeOption || null,
    item.quantity ? `Qty ${item.quantity}` : null,
  ]
    .filter(Boolean)
    .map(esc)
    .join(" &middot; ");

  // The price column only exists when the builder shows prices on the colour
  // screen — a tenant that hides them there must not have them leak out by email.
  const priceCell = showPrices
    ? `<td style="padding: 9px 0 9px 12px; font-size: 13px; font-weight: 600; color: ${
      item.isUpgrade ? "#c2410c" : "#475569"
    }; border-bottom: ${borderBottom}; vertical-align: top; text-align: right; white-space: nowrap;">${esc(
      item.costLabel || PLACEHOLDER,
    )}</td>`
    : "";

  return `
    <tr>
      <td style="padding: 9px 0; font-size: 13px; color: #1e293b; border-bottom: ${borderBottom}; vertical-align: top;">
        <span style="font-weight: 600;">${val(item.itemName)}</span>
        ${meta ? `<br /><span style="font-size: 12px; color: #94a3b8;">${meta}</span>` : ""}
      </td>
      ${priceCell}
    </tr>`;
}

function categoryBlock(category, showPrices) {
  const items = Array.isArray(category.items) ? category.items : [];
  if (items.length === 0) {
    return "";
  }

  const rows = items
    .map((item, index) => itemRow(item, showPrices, index === items.length - 1))
    .join("");

  return `
    <div style="background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 16px; overflow: hidden;">
      <div style="background-color: #f1f5f9; padding: 11px 20px; border-bottom: 1px solid #e2e8f0;">
        <strong style="font-size: 12px; color: #1e293b; text-transform: uppercase; letter-spacing: 0.6px;">${val(
    category.categoryName,
  )}</strong>
      </div>
      <div style="padding: 4px 20px 8px;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%">${rows}</table>
      </div>
    </div>`;
}

/**
 * Branded HTML wrapper — "Colour Selection Received" notification.
 *
 * @param {object} opts
 * @param {string} opts.recipientName   Who is being told (consultant / supervisor)
 * @param {string} opts.customerName    The homebuyer who made the selection
 * @param {string} opts.referenceNumber Job reference, e.g. "LD20260007"
 * @param {string} opts.jobAddress      Full job site address
 * @param {string} opts.submittedAt     Already-formatted submission date
 * @param {Array}  opts.categories      [{ categoryName, items: [{ itemName, itemCode,
 *                                      supplierName, upgradeOption, quantity, costLabel,
 *                                      isUpgrade }] }]
 * @param {number} opts.itemCount       How many items were selected in total
 * @param {string|null} opts.upgradeTotal Formatted upgrade total, or null when hidden
 * @param {boolean} opts.showPrices     Whether the tenant shows colour prices at all
 * @param {string} opts.colourUrl       Deep link to the job's colour screen in the CRM
 * @returns {string} full HTML email string
 */
export function wrapColourSelectionSubmittedHTML({
  recipientName = "",
  customerName = "",
  referenceNumber = "",
  jobAddress = "",
  submittedAt = "",
  categories = [],
  itemCount = 0,
  upgradeTotal = null,
  showPrices = true,
  colourUrl = "#",
} = {}) {
  const jobRows = [
    detailRow("Job Reference", referenceNumber),
    detailRow("Customer", customerName),
    detailRow("Job Address", jobAddress),
    detailRow("Selected On", submittedAt, true),
  ].join("");

  const categoriesHtml = categories.map((category) => categoryBlock(category, showPrices)).join("");

  const summary = [
    `${itemCount} item${itemCount === 1 ? "" : "s"} selected`,
    showPrices && upgradeTotal ? `${upgradeTotal} in upgrades` : null,
  ]
    .filter(Boolean)
    .join(" &middot; ");

  const ctaButton =
    colourUrl && colourUrl !== "#"
      ? `
            <table border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 28px;">
              <tr>
                <td style="background-color: #2563eb; border-radius: 6px; padding: 12px 28px;">
                  <a href="${esc(colourUrl)}" style="font-size: 14px; font-weight: 700; color: #ffffff; text-decoration: none; display: inline-block;">Review Colour Selection</a>
                </td>
              </tr>
            </table>`
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
                <td style="text-align: right;"><span style="font-size: 11px; font-weight: 700; color: #b3d7ff; text-transform: uppercase; letter-spacing: 1px; background-color: rgba(255,255,255,0.15); padding: 4px 10px; border-radius: 4px;">Colour Selection</span></td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ── Body ── -->
        <tr>
          <td style="padding: 36px 40px 30px;">

            <p style="font-size: 15px; color: #475569; margin: 0 0 6px;">Dear ${esc(recipientName) || "Team"},</p>

            <h2 style="font-size: 18px; font-weight: 700; color: #1e293b; margin: 20px 0 10px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">Colour Selection Received</h2>

            <p style="font-size: 14px; color: #475569; line-height: 1.7; margin: 0 0 24px;">
              ${esc(customerName) || "The homebuyer"} has chosen their colours and sent them to you${
  referenceNumber ? ` for job <strong>${esc(referenceNumber)}</strong>` : ""
}. The selections are already saved against the job — please review them and confirm the schedule from the colour screen.
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

            <h3 style="font-size: 15px; font-weight: 700; color: #1e293b; margin: 0 0 6px;">Selected Colours</h3>
            ${summary ? `<p style="font-size: 13px; color: #64748b; margin: 0 0 16px;">${summary}</p>` : ""}

            ${categoriesHtml}

            ${ctaButton}

            <p style="font-size: 14px; color: #475569; margin: 0 0 4px;">Kind regards,</p>
            <p style="font-size: 14px; font-weight: 600; color: #1e293b; margin: 0;">The inBuildify Team</p>

            <p style="font-size: 13px; color: #94a3b8; margin: 24px 0 0;">The full colour selection report is attached to this email as a PDF.</p>
          </td>
        </tr>

        <!-- ── Footer ── -->
        <tr>
          <td style="background-color: #f8fafc; padding: 24px 40px; text-align: center; border-top: 1px solid #eef2f5;">
            <p style="font-size: 12px; color: #94a3b8; margin: 0 0 6px;">You are receiving this because you are assigned to this job. Colour selections stay editable by the customer until they are approved.</p>
            <p style="font-size: 12px; font-weight: 600; color: #64748b; margin: 0;"><strong>inBuildify</strong> | Modern Construction &amp; CRM Solutions</p>
          </td>
        </tr>

      </table>
    </div>`;
}

export default { wrapColourSelectionSubmittedHTML };
