/**
 * HTML for the "Variation" document PDF (attached on customer send / eSign, and
 * shown by Preview).
 *
 * Restyled onto the shared PDF design system (utils/pdfDesignSystem.js) so it
 * matches the Payment Receipt / TAX INVOICE family — amber `#f59e0b` accent,
 * InBuildify logo header, clean dividers, card surfaces, an amber-underlined
 * line-item table and a repeating footer. Items are still GROUPED into sections
 * by item type (Additional / Complimentary / Discount / Notes / Price Master).
 *
 * Rendered by Puppeteer (pdf.service generatePDF): headless Chrome that injects
 * the watermark + print rules and lifts the `.pdf-footer` into the page margin.
 * It aborts every http(s) request, so the brand mark is inlined and there are no
 * remote fonts or images. Page margins come from page.pdf(), hence no page
 * padding here.
 *
 * @param {object} params
 * @param {object} params.variation   - { referenceId, title, amount, variationDate, createdAt }
 * @param {object} [params.customer]  - { name }
 * @param {string} [params.jobReference]
 * @param {Array}  [params.items]     - line items { additional/description, quantity, price, total, item_type }
 * @param {boolean}[params.showPrice] - show the unit-price column (defaults true)
 * @returns {string} HTML string ready for Puppeteer
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
  pdfTable,
  totalsBlock,
  pdfFooter,
} from "./pdfDesignSystem.js";

export function generateVariationDocumentHTML({
  variation = {},
  customer = {},
  jobReference = "",
  items = [],
  showPrice = true,
} = {}) {
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

  const referenceId = variation.referenceId || "-";
  const title = variation.title || "Variation";
  // Total reflects the items actually shown in this PDF (excluding removed items).
  // Colour / price-master items are filtered out upstream when show_price_master_in_pdf
  // is off, so the figure always matches the visible rows — an all-hidden variation
  // reads $0.00 rather than the full stored amount with an empty items table.
  const amount = items.reduce((sum, it) => {
    const isRemoved = it.is_removed || it.isRemoved || it.removed;
    return sum + (isRemoved ? 0 : Number(it.total) || 0);
  }, 0);

  const variationDate = variation.variationDate || variation.createdAt || null;
  const dateStr = (variationDate ? new Date(variationDate) : new Date()).toLocaleDateString(
    "en-GB",
    { day: "2-digit", month: "long", year: "numeric" },
  );

  // Group items by type, in a fixed section order (matching the colour PDF's
  // category grouping). Unknown/blank types fall under "Additional Items".
  // Price-master (colour) items are pulled into their own "Price Master List"
  // section regardless of item_type, so they don't mix with real additionals.
  const TYPE_ORDER = ["additional", "complimentary", "discount", "notes", "priceMaster"];
  const TYPE_LABEL = {
    additional: "Additional Items",
    complimentary: "Complimentary",
    discount: "Discount",
    notes: "Notes",
    priceMaster: "Price Master List",
  };
  const grouped = {};
  for (const it of items) {
    const isMaster = it.is_price_master || it.isPriceMaster;
    let key;
    if (isMaster) {
      key = "priceMaster";
    } else {
      const raw = it.item_type || it.itemType || "additional";
      key = TYPE_LABEL[raw] ? raw : "additional";
    }
    (grouped[key] = grouped[key] || []).push(it);
  }

  const columnCount = showPrice ? 4 : 3;

  // Table header — amber-underlined (design system), money columns right-aligned
  // via the shared `.pdf-amt` class.
  const headHtml = `<tr>
        <th>Item</th>
        <th class="pdf-amt" style="width:80px;">Qty</th>
        ${showPrice ? "<th class=\"pdf-amt\" style=\"width:120px;\">Price</th>" : ""}
        <th class="pdf-amt" style="width:130px;">Total</th>
      </tr>`;

  const bodyRows = TYPE_ORDER.filter((t) => (grouped[t] || []).length)
    .map(
      (t) => `
      <tr>
        <td colspan="${columnCount}" style="background:var(--card-bg);font-weight:bold;padding:10px 12px;font-size:11px;color:var(--heading);border-left:3px solid var(--accent);text-transform:uppercase;letter-spacing:0.4px;">
          ${esc(TYPE_LABEL[t])}
        </td>
      </tr>
      ${grouped[t]
    .map(
      (it) => {
        const isRemoved = it.is_removed || it.isRemoved || it.removed;
        const rowStyle = isRemoved ? "style=\"text-decoration: line-through; color: var(--muted);\"" : "";
        return `
        <tr ${rowStyle}>
          <td><strong>${esc(it.additional || it.description || "-")}${isRemoved ? " (Removed)" : ""}</strong></td>
          <td style="text-align:right;">${Number(it.quantity || 0)}</td>
          ${showPrice ? `<td class="pdf-amt">${money(it.price)}</td>` : ""}
          <td class="pdf-amt">${money(it.total)}</td>
        </tr>`;
      },
    )
    .join("")}
    `,
    )
    .join("");

  const emptyRow = `<tr><td colspan="${columnCount}" style="text-align:center;padding:20px;color:var(--muted);">No items on this variation.</td></tr>`;

  const bodyHtml = `
    ${brandHeader({
    logoHtml: brandLogoHtml(),
    title: "VARIATION",
    metaHtml: docMetaLine("Reference", referenceId) + docMetaLine("Date", dateStr),
  })}
    ${pdfDivider()}

    <div class="pdf-grid-2">
      ${card({
    title: "Customer",
    bodyHtml: infoList(
      infoRow("Name", esc(customer.name) || "-", { raw: true }) +
            infoRow("Job Reference", esc(jobReference) || "-", { raw: true }),
    ),
  })}
      ${card({
    title: "Variation",
    bodyHtml: infoList(
      infoRow("Title", esc(title), { raw: true }) +
            infoRow("Reference", esc(referenceId), { raw: true }),
    ),
  })}
    </div>

    ${sectionHeader("Variation Items")}
    ${pdfTable(headHtml, bodyRows || emptyRow)}

    ${totalsBlock({ grandLabel: "Total Amount", grandValue: money(amount) })}

    ${pdfFooter({
    title: "InBuildify",
    note: "This variation forms part of the building contract and is subject to the same terms and conditions.",
  })}
  `;

  return renderPdfDocument({ title: `Variation ${referenceId}`, bodyHtml });
}

export default { generateVariationDocumentHTML };
