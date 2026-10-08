/**
 * "Colour Schedule" document PDF (the output of the Generate Colors Document
 * page). Presentation now comes entirely from the shared PDF design system
 * (utils/pdfDesignSystem.js) so this document matches the Payment Receipt /
 * TAX INVOICE family — amber `#f59e0b` accent, InBuildify logo header, clean
 * dividers, key/value rows, card surfaces and a repeating page footer.
 *
 * Items are grouped by category (grouping logic + order unchanged); each item
 * shows its image plus name / category / item code / supplier.
 *
 * Rendered server-side by `pdf.service.generatePDF` (headless Chrome), which
 * injects the background watermark + universal print rules and lifts the
 * `.pdf-footer` into the bottom page margin so it repeats on every page.
 *
 * @param {{ items: object[], jobInfo: object, logoBase64?: string }} params
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
  pdfTable,
  pdfFooter,
  docMetaLine,
  esc,
} from "./pdfDesignSystem.js";

export function generateColorDocumentHTML({ items = [], jobInfo = {}, logoBase64 = null }) {
  const { jobAddress = "", customerName = "", referenceNumber = "" } = jobInfo;

  // Group items by category name. (Grouping logic + insertion order preserved.)
  const grouped = {};
  for (const item of items) {
    const cat = item.categoryName || "Uncategorized";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  }

  // Small thumbnail cell: the item's colour image (data URI) or a muted fallback.
  const imageCell = (item) =>
    item._imageBase64
      ? `<img src="${item._imageBase64}" alt="" style="width:110px;height:80px;object-fit:contain;border-radius:4px;border:1px solid var(--border);" />`
      : `<span style="color:var(--muted);font-size:10px;">No image</span>`;

  const itemRow = (item) => `
      <tr>
        <td>${imageCell(item)}</td>
        <td><strong>${esc(item.itemName || item.colorName || "-")}</strong></td>
        <td>${esc(item.categoryName || "-")}</td>
        <td>${esc(item.itemCode || "-")}</td>
        <td>${esc(item.supplierName || "-")}</td>
      </tr>`;

  const sections = Object.entries(grouped)
    .map(
      ([category, catItems]) => `
      ${sectionHeader(category)}
      ${pdfTable(
        `<tr><th>Image</th><th>Item</th><th>Category</th><th>Item Code</th><th>Supplier</th></tr>`,
        catItems.map(itemRow).join(""),
      )}`,
    )
    .join("");

  const today = new Date().toLocaleDateString("en-GB", {
    day: "2-digit", month: "long", year: "numeric",
  });

  const bodyHtml = `
    ${brandHeader({
      logoHtml: brandLogoHtml(logoBase64),
      title: "Colour Schedule",
      subtitle: "Selected Colours & Finishes",
      metaHtml:
        docMetaLine("Reference", referenceNumber || "-") +
        docMetaLine("Date", today),
    })}
    ${pdfDivider()}

    <div class="pdf-grid-2">
      ${card({
        title: "Customer Information",
        bodyHtml: infoList(
          infoRow("Customer Name", customerName || "-") +
            infoRow("Reference No", referenceNumber || "-"),
        ),
      })}
      ${card({
        title: "Property Information",
        bodyHtml: infoList(infoRow("Job Address", jobAddress || "-")),
      })}
    </div>

    ${sections || `<div class="pdf-empty">No colour items found for this job.</div>`}

    ${pdfFooter({
      title: "InBuildify",
      note: "This colour schedule forms part of the quotation and is subject to the same terms and conditions.",
    })}
  `;

  return renderPdfDocument({ title: "Colour Schedule", bodyHtml });
}
