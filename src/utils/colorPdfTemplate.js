/**
 * Colour Selection Summary PDF.
 *
 * Rendered server-side by `pdf.service.generatePDF` (headless Chrome), which
 * injects the background watermark + universal print rules and lifts the
 * `.pdf-footer` into the page margin. All visual styling now comes from the
 * shared PDF design system (utils/pdfDesignSystem.js) so this document matches
 * the Payment Receipt / TAX INVOICE family — amber `#f59e0b` accent, InBuildify
 * logo header, clean dividers, key/value rows, card surfaces and a repeating
 * footer. Only the presentation changed: every data field, fallback, unit
 * string, grouping and money format is unchanged, and the cost-type badge keeps
 * its semantic (upgrade/standard) colours.
 *
 * @param {{ items: object[], jobInfo: object, logoBase64?: string, showImage?: boolean, showPrice?: boolean }} params
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
  pdfFooter,
  docMetaLine,
  pdfTable,
  totalsBlock,
  esc,
} from "./pdfDesignSystem.js";

export function generateColorPdfHTML({
  items = [],
  jobInfo = {},
  logoBase64 = null,
  showImage = true,
  showPrice = true,
}) {
  const {
    jobAddress = '',
    customerName = '',
    referenceNumber = '',
  } = jobInfo;

  // Group items by category name
  const grouped = {};
  for (const item of items) {
    const cat = item.colorCategory?.name ?? 'General';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  }

  const money = (n) =>
    `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // `item.cost` is the UNIT PRICE; what the colour screen labels "Cost" — and
  // what this PDF must bill — is that price times the units selected for the
  // job. One helper feeds both the row and the total so the two can never
  // disagree, and it mirrors the screen's own sum (missing units => 1 unit;
  // an unparseable value falls back to the bare price rather than NaN).
  const rowCost = (item) => {
    if (item.costType !== 'upgrade' || item.cost == null) return null;
    const price = Number(item.cost);
    if (!Number.isFinite(price)) return null;
    const qty = item.unit ? parseFloat(item.unit) : 1;
    return Number.isFinite(qty) ? price * qty : price;
  };

  const formatCost = (item) => {
    const cost = rowCost(item);
    return cost == null ? '-' : money(cost);
  };

  // Compute total from actual items — only upgrade items have a cost
  const computedTotal = items.reduce((sum, item) => sum + (rowCost(item) ?? 0), 0);
  const totalDisplay = money(computedTotal);

  // Show the arithmetic whenever more than one unit was selected, so the row
  // cost cannot be mistaken for the unit price.
  const unitsLine = (item) => {
    if (!item.unit) return '';
    const qty = parseFloat(item.unit);
    const price = Number(item.cost);
    const showMath = Number.isFinite(qty) && qty !== 1 && item.costType === 'upgrade' && Number.isFinite(price);
    const detail = showMath ? `${esc(item.unit)} &times; ${esc(money(price))}` : esc(item.unit);
    return `<br/><span style="color:var(--muted);font-size:11px;">Units: ${detail}</span>`;
  };

  const imageCell = (item) => {
    if (item._imageBase64) {
      return `<img src="${esc(item._imageBase64)}" style="width:60px;height:60px;object-fit:contain;border-radius:4px;border:1px solid var(--border);" />`;
    }
    return '<span style="color:var(--muted);font-size:12px;">No image</span>';
  };

  // Cost-type badge keeps its SEMANTIC status colours (upgrade vs standard).
  const typeBadge = (item) => `<span style="
            background:${item.costType === 'upgrade' ? '#fff3cd' : '#d1fae5'};
            color:${item.costType === 'upgrade' ? '#856404' : '#065f46'};
            border-radius:4px;padding:4px 10px;font-size:11px;font-weight:600;display:inline-block;
          ">${item.costType === 'upgrade' ? 'Upgrade' : 'Standard'}</span>`;

  // Columns are built dynamically so the Image/Cost toggles fully control the layout
  const columnCount = 3 + (showImage ? 1 : 0) + (showPrice ? 1 : 0);

  const headHtml = `<tr>
    ${showImage ? '<th style="width:80px;text-align:center;">Image</th>' : ''}
    <th>Item Name</th>
    <th style="width:120px;">Item Code</th>
    <th style="width:100px;text-align:center;">Type</th>
    ${showPrice ? '<th class="pdf-amt" style="width:120px;">Cost</th>' : ''}
  </tr>`;

  const categoryRows = Object.entries(grouped).map(([category, catItems]) => `
    <tr>
      <td colspan="${columnCount}" style="background:var(--card-bg);font-weight:bold;padding:10px 12px;font-size:12px;color:var(--heading);border-left:4px solid var(--accent);text-transform:uppercase;letter-spacing:0.4px;">
        ${esc(category)}
      </td>
    </tr>
    ${catItems.map(item => `
      <tr>
        ${showImage ? `<td style="text-align:center;vertical-align:middle;padding:10px 6px;">${imageCell(item)}</td>` : ''}
        <td style="vertical-align:middle;">
          <strong>${esc(item.itemName || item.name || '-')}</strong>
          ${unitsLine(item)}
        </td>
        <td style="vertical-align:middle;">${esc(item.itemCode || '-')}</td>
        <td style="text-align:center;vertical-align:middle;">
          ${typeBadge(item)}
        </td>
        ${showPrice ? `<td class="pdf-amt" style="vertical-align:middle;">${esc(formatCost(item))}</td>` : ''}
      </tr>
    `).join('')}
  `).join('');

  const emptyRow = `<tr><td colspan="${columnCount}" style="text-align:center;padding:20px;color:var(--muted);">No items selected</td></tr>`;

  const today = new Date().toLocaleDateString('en-GB', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  // ── Header meta (reference + date), matching the receipt's right-hand meta ──
  const metaHtml =
    docMetaLine('Reference', referenceNumber || '-') +
    docMetaLine('Date', today);

  // ── Customer / Property info cards ──────────────────────────────────────────
  const customerCard = card({
    title: 'Customer Information',
    bodyHtml: infoList(
      infoRow('Customer Name', customerName || '-') +
        infoRow('Reference No', referenceNumber || '-'),
    ),
  });

  const propertyCard = card({
    title: 'Property Information',
    bodyHtml: infoList(infoRow('Job Address', jobAddress || '-')),
  });

  // ── Signature blocks (shared design-system classes) ─────────────────────────
  const signatureBlock = (label) => `
    <div class="pdf-signature">
      <div class="pdf-signature-line">
        <div class="pdf-addr-title">${esc(label)}</div>
        <div style="color:var(--muted);font-size:12px;margin-top:10px;">Name: ___________________________</div>
        <div style="color:var(--muted);font-size:12px;margin-top:8px;">Date: ___________________________</div>
      </div>
    </div>`;

  // ── Assemble document ───────────────────────────────────────────────────────
  const bodyHtml = `
    ${brandHeader({
      logoHtml: brandLogoHtml(logoBase64),
      title: 'Colour Selection',
      subtitle: 'Selection Summary',
      metaHtml,
    })}
    ${pdfDivider()}

    <div class="pdf-grid-2">
      ${customerCard}
      ${propertyCard}
    </div>

    ${sectionHeader('Selected Colour Items')}
    ${pdfTable(headHtml, categoryRows || emptyRow)}

    ${showPrice ? totalsBlock({ grandLabel: 'Total Upgrade Cost', grandValue: totalDisplay }) : ''}

    <div class="pdf-signatures">
      ${signatureBlock('Customer Signature')}
      ${signatureBlock('Consultant Signature')}
    </div>

    ${pdfFooter({ title: 'InBuildify', note: 'Colour Selection Summary' })}
  `;

  return renderPdfDocument({ title: 'Colour Selection Summary', bodyHtml });
}

export default { generateColorPdfHTML };
