/**
 * HTML for the "Invoice" document PDF attached to the "Send Invoice to Customer"
 * step of the variation status tracker, for the variation amount.
 *
 * Styled to match the TAX INVOICE the job Invoice & Payments tab issues
 * (CRMSimplify components/pdf/Invoice.tsx): amber accent, BILLED TO / FROM
 * blocks, GST line, remittance panel and payment terms. All visual styling now
 * comes from the shared PDF design system (utils/pdfDesignSystem.js) so this
 * document is a single source of truth alongside the rest of the InBuildify PDF
 * family — the same amber `#f59e0b` accent, the real InBuildify logo header,
 * clean dividers, reference strip, data table, totals block, bank panel and the
 * repeating page footer.
 *
 * Rendered server-side by `pdf.service.generatePDF` (headless Chrome), which
 * injects the background watermark + universal print rules, aborts every
 * http(s) request (so the design system inlines the logo and uses a system font
 * stack — no remote assets), and lifts the `.pdf-footer` into the bottom page
 * margin. Page margins come from page.pdf() (20mm), hence no page padding here.
 *
 * The data shape and every field it maps are unchanged from the previous
 * version — only the presentation changes.
 *
 * @param {object} params
 * @param {object} params.invoice     - { number, invoiceDate, dueDate, termsDays }
 * @param {object} params.variation   - { referenceId, title, amount }
 * @param {object} [params.customer]  - { name, email, phone, address }
 * @param {object} [params.company]   - { name, abnNumber, address1, address2, city, zipPostalCode,
 *                                        accountName, accountNumber, accountBsb, bankName, email }
 * @param {string} [params.jobReference]
 * @param {Array}  [params.items]     - line items { additional/description, quantity, price, total }
 * @returns {string} HTML string ready for Puppeteer
 */
import {
  renderPdfDocument,
  brandHeader,
  brandLogoHtml,
  pdfDivider,
  docMetaLine,
  addressBlock,
  addresses,
  refsBox,
  pdfTable,
  totalsBlock,
  bankPanel,
  pdfFooter,
} from "./pdfDesignSystem.js";

export function generateInvoiceDocumentHTML({
  invoice = {},
  variation = {},
  customer = {},
  company = {},
  jobReference = "",
  items = [],
} = {}) {
  // ── Local formatting helpers (behaviour preserved verbatim) ─────────────────
  // Kept local so the exact escaping / number / date behaviour is unchanged; the
  // design-system component helpers escape their own inputs, so these are only
  // used for the raw HTML fragments this template builds itself.
  const esc = (v) =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const money = (n) =>
    `$${Number(n || 0).toLocaleString("en-AU", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  // Matches the job invoice, which prints the API's raw DATEONLY value.
  const fmtDate = (d) => {
    if (!d) return "N/A";
    const dt = d instanceof Date ? d : new Date(d);
    return Number.isNaN(dt.getTime()) ? "N/A" : dt.toISOString().slice(0, 10);
  };

  const or = (v, alt = "N/A") => {
    const s = v === null || v === undefined ? "" : String(v).trim();
    return s || alt;
  };

  // ── Derived values (unchanged) ──────────────────────────────────────────────
  const invoiceNumber = or(invoice.number, "-");
  const referenceId = or(variation.referenceId, "-");
  const title = or(variation.title, "Variation");
  const amount = variation.amount || 0;
  const invoiceDateStr = fmtDate(invoice.invoiceDate);
  // No terms configured (0 days) means payment is due on receipt rather than on
  // a future date — say so instead of printing today's date as a deadline.
  const dueOnReceipt = !Number(invoice.termsDays);
  const dueStr = dueOnReceipt ? "Due on receipt" : fmtDate(invoice.dueDate);

  const companyStreet = [company.address1, company.address2].filter(Boolean).join(", ");
  const companyCity = [company.city, company.zipPostalCode].filter(Boolean).join(", ");

  // ── Line-item table ─────────────────────────────────────────────────────────
  // The design's table is Description | Amount, so quantity/unit price fold into
  // the description rather than being dropped.
  const rows = items
    .map((it) => {
      const label = it.additional || it.description || "-";
      const qty = Number(it.quantity || 0);
      const price = Number(it.price || 0);
      const detail = qty > 1 ? ` (${qty} × ${money(price)})` : "";
      return `
        <tr>
          <td>${esc(label)}${esc(detail)}</td>
          <td class="pdf-amt">${money(it.total)}</td>
        </tr>`;
    })
    .join("");

  // An empty item list still has a variation amount to bill — show what it is
  // for rather than an empty table.
  const fallbackRow = `
        <tr>
          <td>${esc(title)}</td>
          <td class="pdf-amt">${money(amount)}</td>
        </tr>`;

  const tableHead = `
    <tr>
      <th>Description</th>
      <th class="pdf-amt" style="width:130px;">Amount</th>
    </tr>`;

  // ── Payment terms (design-system .pdf-terms classes, raw markup) ────────────
  const termsHtml = `
    <div class="pdf-terms">
      <div class="pdf-terms-title">Payment Terms</div>
      <div class="pdf-terms-text">Payment is strictly due by <span class="pdf-terms-date">${esc(dueStr)}</span>. Please ensure your payment is processed by this date to avoid any late fees.</div>
    </div>`;

  // Closing note — carries the company contact e-mail and the variation/contract
  // reference from the original template. These live in the document body (not
  // the repeating page-margin footer, which is kept concise) so no data field is
  // dropped.
  const closingNoteHtml = `
    <div style="margin-top:24px; text-align:center;">
      <p style="font-size:9px; color:var(--muted); margin:0 0 6px;">If you have any questions about this invoice, please contact us at ${esc(or(company.email, "support"))}</p>
      <p style="font-size:8px; color:#9ca3af; margin:0;">This invoice relates to variation ${esc(referenceId)}, which forms part of the building contract and is subject to the same terms and conditions.</p>
    </div>`;

  // ── Assemble document ──────────────────────────────────────────────────────
  const bodyHtml = `
    ${brandHeader({
      logoHtml: brandLogoHtml(),
      title: "TAX INVOICE",
      metaHtml:
        docMetaLine("Invoice No", invoiceNumber) +
        docMetaLine("Date", invoiceDateStr) +
        docMetaLine("Payment Due", dueStr),
    })}

    ${addresses(
      addressBlock({
        title: "Billed To:",
        name: or(customer.name),
        lines: [or(customer.address), or(customer.phone), or(customer.email)],
      }),
      addressBlock({
        title: "From:",
        name: or(company.name, "Company Name"),
        // companyStreet / companyCity fall away when blank (addressBlock drops
        // empty lines), preserving the original conditional rendering; the ABN
        // line always prints with its "N/A" fallback.
        lines: [companyStreet, companyCity, `ABN : ${or(company.abnNumber)}`],
        align: "right",
      }),
    )}

    ${pdfDivider()}

    ${refsBox({
      left: `Job Ref: ${or(jobReference)}`,
      right: `Invoice Ref: ${invoiceNumber}`,
      sub: `Variation: ${referenceId} — ${title}`,
    })}

    ${pdfTable(tableHead, rows || fallbackRow)}

    ${totalsBlock({
      rows: [
        { label: "SubTotal:", value: money(amount) },
        { label: "GST:", value: money(0) },
      ],
      grandLabel: "TOTAL DUE",
      grandValue: money(amount),
    })}

    ${bankPanel({
      title: "Please credit funds direct to the following account details:",
      lines: [
        `A/C Name : ${or(company.accountName)}, A/C No : ${or(company.accountNumber)}, BSB : ${or(company.accountBsb)}`,
        `Bank : ${or(company.bankName)}`,
      ],
    })}

    ${termsHtml}

    ${closingNoteHtml}

    ${pdfFooter({ title: "InBuildify", note: "Thank you for your business!" })}
  `;

  return renderPdfDocument({ title: `Invoice ${invoiceNumber}`, bodyHtml });
}

export default { generateInvoiceDocumentHTML };
