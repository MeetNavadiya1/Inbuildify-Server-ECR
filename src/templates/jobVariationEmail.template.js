/**
 * Branded email for the "Variation approved" notification sent to a builder.
 *
 * Mirrors the shared house layout used by auth-email.template.js and
 * engineer-email.template.js (inBuildify header + summary card + footer) so the
 * delivered email is styled consistently. Inline CSS only — email clients ignore
 * <style>/external CSS. Kept self-contained so it needs no seeded
 * NotificationTemplate row.
 */

function esc(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const money = (n) =>
  `$${Number(n || 0).toLocaleString("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/** Default subject line for the approval notification. */
export function variationApprovedSubject({ referenceId, jobReference }) {
  return `Variation ${referenceId || ""} approved${
    jobReference ? ` — ${jobReference}` : ""
  }`.trim();
}

/**
 * The default editable message shown in the mail composer (rich-text friendly).
 * This is what the frontend loads into the "Message" box as a starting point.
 */
export function defaultVariationMessageHtml({
  builderName,
  referenceId,
  jobReference,
  amount,
}) {
  return [
    `<p>Dear ${esc(builderName || "Builder")},</p>`,
    `<p>The variation <strong>${esc(referenceId)}</strong>${
      jobReference ? ` for job <strong>${esc(jobReference)}</strong>` : ""
    } has been <strong>approved</strong>, with a total of <strong>${money(
      amount,
    )}</strong>.</p>`,
    "<p>Please find the variation details below. Feel free to reach out if you have any questions.</p>",
  ].join("");
}

/**
 * Default editable message for the customer send ("Send this Variation"), where
 * the variation document is attached as a PDF.
 */
export function defaultCustomerVariationMessageHtml({
  customerName,
  referenceId,
  jobReference,
  amount,
}) {
  return [
    `<p>Dear ${esc(customerName || "Customer")},</p>`,
    `<p>Please find attached the variation <strong>${esc(referenceId)}</strong>${
      jobReference ? ` for job <strong>${esc(jobReference)}</strong>` : ""
    }, totalling <strong>${money(amount)}</strong>, for your review.</p>`,
    "<p>Please review the attached document and let us know if you have any questions.</p>",
  ].join("");
}

/** Invoice number for a variation's invoice — "INV-<variation reference>". */
export function variationInvoiceNumber(referenceId) {
  return `INV-${referenceId || ""}`.replace(/-$/, "");
}

/** Default subject line for the invoice sent to the customer. */
export function variationInvoiceSubject({ invoiceNumber, jobReference }) {
  return `Invoice ${invoiceNumber || ""}${jobReference ? ` — ${jobReference}` : ""}`.trim();
}

const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })
    : "";

/**
 * Default editable message for the invoice send ("Send Invoice to Customer"),
 * where the invoice document is attached as a PDF. `dueDate` is omitted when the
 * builder has no payment terms configured — payment is then due on receipt.
 */
export function defaultInvoiceMessageHtml({
  customerName,
  invoiceNumber,
  referenceId,
  jobReference,
  amount,
  dueDate,
}) {
  return [
    `<p>Dear ${esc(customerName || "Customer")},</p>`,
    `<p>Please find attached invoice <strong>${esc(invoiceNumber)}</strong> for variation <strong>${esc(
      referenceId,
    )}</strong>${jobReference ? ` on job <strong>${esc(jobReference)}</strong>` : ""}, totalling <strong>${money(
      amount,
    )}</strong>.</p>`,
    dueDate
      ? `<p>Payment is due by <strong>${esc(fmtDate(dueDate))}</strong>.</p>`
      : "<p>Payment is due on receipt.</p>",
    "<p>Please let us know if you have any questions about this invoice.</p>",
  ].join("");
}

/**
 * Variation line-items rendered as a summary card, styled to match the
 * "Specification Summary" card in engineer-email.template.js.
 */
function variationSummaryCard(items = [], amount, cardTitle = "Variation Details") {
  const headerCell = (label, align = "left", pad = "8px 20px") =>
    `<td style="padding: ${pad}; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; text-align: ${align}; border-bottom: 1px solid #e2e8f0;">${esc(
      label,
    )}</td>`;

  const rows = items
    .map(
      (it) => {
        const isRemoved = it.is_removed || it.isRemoved || it.removed;
        const rowStyle = isRemoved ? "text-decoration: line-through; color: #94a3b8;" : "";
        return `
      <tr style="${rowStyle}">
        <td style="padding: 10px 20px; font-size: 14px; color: inherit; border-bottom: 1px solid #e2e8f0;">${esc(
    it.additional || it.description || "-",
  )}${isRemoved ? " (Removed)" : ""}</td>
        <td style="padding: 10px 12px; font-size: 14px; color: inherit; text-align: right; border-bottom: 1px solid #e2e8f0;">${Number(
    it.quantity || 0,
  )}</td>
        <td style="padding: 10px 12px; font-size: 14px; color: inherit; text-align: right; border-bottom: 1px solid #e2e8f0;">${money(
    it.price,
  )}</td>
        <td style="padding: 10px 20px 10px 12px; font-size: 14px; font-weight: 600; color: inherit; text-align: right; border-bottom: 1px solid #e2e8f0;">${money(
    it.total,
  )}</td>
      </tr>`;
      },
    )
    .join("");

  const columnHeader = items.length
    ? `<tr>
        ${headerCell("Item")}
        ${headerCell("Qty", "right", "8px 12px")}
        ${headerCell("Price", "right", "8px 12px")}
        ${headerCell("Total", "right", "8px 20px 8px 12px")}
      </tr>`
    : "";

  return `
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin: 24px 0 8px; border-collapse: separate; overflow: hidden;">
      <tr>
        <td colspan="4" style="background-color: #f1f5f9; padding: 12px 20px; border-bottom: 1px solid #e2e8f0;">
          <strong style="font-size: 13px; color: #1e293b; text-transform: uppercase; letter-spacing: 0.5px;">${esc(
    cardTitle,
  )}</strong>
        </td>
      </tr>
      ${columnHeader}
      ${rows}
      <tr>
        <td colspan="3" style="padding: 14px 20px; font-size: 14px; font-weight: 700; color: #1e293b; text-align: right;">Total Amount</td>
        <td style="padding: 14px 20px 14px 12px; font-size: 15px; font-weight: 800; color: #0056b3; text-align: right;">${money(
    amount,
  )}</td>
      </tr>
    </table>`;
}

/**
 * House-style branded wrapper (identical shell to the auth/engineer templates).
 */
function wrapVariationEmailHTML({ subject = "", bodyHtml = "", pillText = "Variation" } = {}) {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f6f9fc; padding: 40px 10px; margin: 0;">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid #eef2f5;">
        <tr>
          <td style="background-color: #0056b3; padding: 28px 40px;">
            <table border="0" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td><span style="font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">inBuildify</span></td>
                <td style="text-align: right;"><span style="font-size: 11px; font-weight: 700; color: #b3d7ff; text-transform: uppercase; letter-spacing: 1px; background-color: rgba(255,255,255,0.15); padding: 4px 10px; border-radius: 4px;">${esc(
    pillText,
  )}</span></td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding: 36px 40px 30px;">
            ${subject ? `<h2 style="font-size: 20px; font-weight: 700; color: #1e293b; margin: 0 0 18px; line-height: 1.3;">${esc(subject)}</h2>` : ""}
            <div style="font-size: 15px; color: #475569; line-height: 1.6;">${bodyHtml}</div>
          </td>
        </tr>
        <tr>
          <td style="background-color: #f8fafc; padding: 28px 40px; text-align: center; border-top: 1px solid #eef2f5;">
            <p style="font-size: 12px; color: #94a3b8; margin: 0 0 8px;">This is an automated notification regarding a job variation. Please do not reply directly to this email.</p>
            <p style="font-size: 12px; font-weight: 600; color: #64748b; margin: 0;"><strong>inBuildify</strong> | Modern Construction &amp; CRM Solutions</p>
          </td>
        </tr>
      </table>
    </div>`;
}

/**
 * Build the final email ({ subject, html, text }) for sending.
 *
 * @param {object} opts
 * @param {string} [opts.builderName]
 * @param {string} [opts.jobReference]
 * @param {string} opts.referenceId       - variation reference id (e.g. "0003-V8")
 * @param {number|string} opts.amount
 * @param {Array}  [opts.items]           - variation line items
 * @param {string} [opts.userMessageHtml] - message typed by the sender; when
 *                                          empty the default intro is used
 */
export function buildVariationEmail({
  builderName,
  jobReference,
  referenceId,
  amount,
  items = [],
  userMessageHtml = null,
}) {
  const subject = variationApprovedSubject({ referenceId, jobReference });

  const intro =
    userMessageHtml && String(userMessageHtml).trim()
      ? String(userMessageHtml)
      : defaultVariationMessageHtml({ builderName, referenceId, jobReference, amount });

  const bodyHtml = `${intro}${variationSummaryCard(items, amount)}`;
  const html = wrapVariationEmailHTML({ subject, bodyHtml, pillText: "Variation" });

  const itemsText = (items || [])
    .map(
      (it) => {
        const isRemoved = it.is_removed || it.isRemoved || it.removed;
        return `- ${it.additional || it.description || "Item"}${isRemoved ? " (Removed)" : ""}: ${Number(
          it.quantity || 0,
        )} x ${money(it.price)} = ${money(it.total)}`;
      },
    )
    .join("\n");

  const text =
    `Variation ${referenceId} has been approved${
      jobReference ? ` for job ${jobReference}` : ""
    }.\n\n${
      itemsText ? `${itemsText}\n\n` : ""
    }Total Amount: ${money(amount)}`;

  return { subject, html, text };
}

/**
 * Build the final invoice email ({ subject, html, text }) sent to the customer
 * at the "Send Invoice to Customer" step. The invoice PDF is attached by the
 * caller; this is the covering message plus a line-item card.
 *
 * @param {object} opts
 * @param {string} [opts.customerName]
 * @param {string} [opts.jobReference]
 * @param {string} opts.referenceId       - variation reference id (e.g. "0003-V8")
 * @param {string} opts.invoiceNumber     - e.g. "INV-0003-V8"
 * @param {number|string} opts.amount
 * @param {Date|string} [opts.dueDate]    - omitted => due on receipt
 * @param {Array}  [opts.items]           - variation line items
 * @param {string} [opts.userMessageHtml] - message typed by the sender; when
 *                                          empty the default intro is used
 */
export function buildInvoiceEmail({
  customerName,
  jobReference,
  referenceId,
  invoiceNumber,
  amount,
  dueDate = null,
  items = [],
  userMessageHtml = null,
}) {
  const subject = variationInvoiceSubject({ invoiceNumber, jobReference });

  const intro =
    userMessageHtml && String(userMessageHtml).trim()
      ? String(userMessageHtml)
      : defaultInvoiceMessageHtml({
        customerName,
        invoiceNumber,
        referenceId,
        jobReference,
        amount,
        dueDate,
      });

  const bodyHtml = `${intro}${variationSummaryCard(items, amount, "Invoice Details")}`;
  const html = wrapVariationEmailHTML({ subject, bodyHtml, pillText: "Invoice" });

  const itemsText = (items || [])
    .map(
      (it) => {
        const isRemoved = it.is_removed || it.isRemoved || it.removed;
        return `- ${it.additional || it.description || "Item"}${isRemoved ? " (Removed)" : ""}: ${Number(
          it.quantity || 0,
        )} x ${money(it.price)} = ${money(it.total)}`;
      },
    )
    .join("\n");

  const text =
    `Invoice ${invoiceNumber} for variation ${referenceId}${
      jobReference ? ` on job ${jobReference}` : ""
    }.\n\n${
      itemsText ? `${itemsText}\n\n` : ""
    }Amount Due: ${money(amount)}\n${
      dueDate ? `Payment due by ${fmtDate(dueDate)}` : "Payment is due on receipt"}`;

  return { subject, html, text };
}

export default {
  variationApprovedSubject,
  defaultVariationMessageHtml,
  defaultCustomerVariationMessageHtml,
  buildVariationEmail,
  variationInvoiceNumber,
  variationInvoiceSubject,
  defaultInvoiceMessageHtml,
  buildInvoiceEmail,
};
