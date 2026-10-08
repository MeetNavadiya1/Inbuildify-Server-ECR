/**
 * Quotation PDF template.
 *
 * Rendered server-side by `pdf.service.generatePDF` (headless Chrome), which
 * injects the background watermark + universal print rules and lifts the
 * `.pdf-footer` into the page margin. All visual styling comes from the shared
 * PDF design system (utils/pdfDesignSystem.js) so this document matches the
 * Payment Receipt / TAX INVOICE family — amber `#f59e0b` accent, InBuildify
 * logo header, clean dividers, key/value rows, card surfaces and a repeating
 * footer.
 *
 * The `data` shape and every field it maps are unchanged from the previous
 * version — only the presentation. This is the most detailed document in the
 * family: all price-list grouping, subtotal maths and conditional sections are
 * preserved exactly.
 *
 * @param {Object} data - Quotation version details
 * @returns {string} - HTML string
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
import { buildTermsUrl } from "./quotationTermsLink.js";

export const generateQuotationHTML = (data) => {
    const {
        quotationVersionNo,
        // locationName,
        // rangeName,
        dwellingTypeName,
        structuralEngineer,
        totalPackageCost = 0,
        totalPricelistCost = 0,
        facadePrice = 0,
        grandTotalCost = 0,
        createdAt,
        termsPublicToken,
        termsTitle,
    } = data;

    // `getQuotationVersionDetailsById` builds each of these with a scalar
    // sub-select. A sub-select that matches no row yields SQL NULL, which arrives
    // here as `null` — and a destructuring default only fires on `undefined`, so
    // `floorPlan = {}` never applied. A quotation saved without a floor plan
    // reached `floorPlan.detailedImage` and took the PDF worker down with
    // "Cannot read properties of null", retried, and failed the same way forever.
    //
    // Coalescing is the right answer rather than refusing to render: every field
    // below is already read as `|| "N/A"` and `imageBox` already draws a
    // placeholder, so an empty object produces exactly the partial-quotation
    // document this template was written to produce.
    const floorPlan = data.floorPlan || {};
    const facade = data.facade || {};
    const pkg = data.package || {};
    // The details query returns this key as `property`; keep `propertyDetail`
    // as a fallback for any caller still passing the old shape. Null here is the
    // ordinary case of a lead with no property_detail_id.
    const propertyDetail = data.property || data.propertyDetail || {};
    // Both are COALESCE'd to '[]' in SQL today, so they arrive as arrays — held
    // to the same rule anyway so a caller passing a thinner object cannot crash
    // the render on `.filter` or `[0]`.
    const quotationVersionItems = data.quotationVersionItems || [];
    const leadContacts = data.leadContacts || [];

    const contact = leadContacts[0] || {};
    const date = new Date(createdAt).toLocaleDateString();

    // Split the rows the same way the money is split, so the tables reconcile
    // with the totals block:
    //
    //   package summary  packageId && !priceListItemId → shown as the package
    //                    headline price, never as a line item
    //   package member   packageId && priceListItemId  → SELECTED PACKAGE table;
    //                    total_price is 0 because it is bundled into the package
    //   inclusion        !packageId                    → INCLUSIONS table; this
    //                    is exactly the set `totalPricelistCost` sums
    //
    // This deliberately does NOT key off `isPackageMapped`. That flag is a
    // lookup against package_pricelist_item_map — i.e. "this price-list item
    // appears in the selected package's master definition" — not "this row is
    // part of the package". It misclassified rows in both directions: a
    // standalone item the estimator added by hand was pulled out of the
    // inclusions table (while its money stayed inside Value of Inclusions), and
    // a package member whose master mapping was later edited fell back into the
    // inclusions table.
    const packageMappedItems = quotationVersionItems.filter(
        (item) => !!item.packageId && !!item.priceListItemId,
    );
    const inclusionItems = quotationVersionItems.filter((item) => !item.packageId);

    // price_list_item.uom is stored as an enum-ish token (SQ_M, CUBIC_METER, …).
    // These labels mirror UOM_OPTIONS in the CRM's AddMasterPricingItemModel, so
    // the quotation PDF reads exactly like the UOM dropdown the estimator picked
    // from. Keep the two lists in sync when a unit is added. Unknown/legacy
    // tokens fall back to the raw value with the underscores stripped.
    const UOM_LABELS = {
        SQ_FT: "Square Feet (sq ft)",
        SQ_M: "Square Meter (sq m)",
        SQ_YD: "Square Yard (sq yd)",
        ACRE: "Acre",
        HECTARE: "Hectare",
        CUBIC_METER: "Cubic Meter (m³)",
        CUBIC_FEET: "Cubic Feet (ft³)",
        KG: "Kilogram (kg)",
        TON: "Ton",
        METER: "Meter (m)",
        FEET: "Feet (ft)",
        NOS: "Number (Nos)",
        UNITS: "Units",
        LITER: "Liter (L)",
    };
    const uomLabel = (uom) =>
        uom ? UOM_LABELS[uom] || String(uom).replace(/_/g, " ") : "-";

    // Shared 5-column header for the line-item tables (amber underline via
    // .pdf-table; amounts right-aligned via .pdf-amt).
    const tableHead = `
    <tr>
      <th>Description</th>
      <th style="text-align: center; width: 60px;">Qty</th>
      <th style="text-align: center; width: 130px;">UOM</th>
      <th class="pdf-amt" style="width: 120px;">Unit Price</th>
      <th class="pdf-amt" style="width: 120px;">Total</th>
    </tr>`;

    // ── Money ────────────────────────────────────────────────────────────────
    // `amount` is null/undefined tolerant but ZERO-PRESERVING. The old
    // `item.totalPrice || item.packageCost || 0` fell through on a legitimate
    // $0 — and every package member row is a legitimate $0 (its price is
    // bundled into the package) — so each of those rows printed the entire
    // package price as both its unit price and its line total, and
    // renderGroupedItemRows added that phantom amount into the group subtotal.
    const amount = (v) => {
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : 0;
    };
    // Two decimals always: plain toLocaleString rendered 392.50 as "$392.5".
    const money = (v) => {
        const n = amount(v);
        const abs = Math.abs(n).toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
        return n < 0 ? `-$${abs}` : `$${abs}`;
    };
    // Sum a set of rows the same way `totalPricelistCost` sums them in SQL.
    const sumRows = (rows) => rows.reduce((sum, it) => sum + amount(it.totalPrice), 0);

    /**
     * @param {Array} rows
     * @param {boolean} [bundled] rows bundled inside the package: their
     *   total_price is 0 by design, so print "Included" rather than "$0.00".
     */
    const renderItemRows = (rows, { bundled = false } = {}) =>
        rows
            .map(
                (item) => `
    <tr>
      <td>${esc(item.priceListItemDescription || item.packageName || (item.packageId ? "Package Item" : "Miscellaneous"))}</td>
      <td style="text-align: center;">${esc(item.quantity || 1)}</td>
      <td style="text-align: center;">${esc(uomLabel(item.priceListItemUom))}</td>
      <td class="pdf-amt">${money(item.priceListItemCost)}</td>
      <td class="pdf-amt">${bundled && amount(item.totalPrice) === 0 ? "Included" : money(item.totalPrice)}</td>
    </tr>
  `,
            )
            .join("");

    // Group the inclusion items under their originating price list ("Base
    // Price", "kichen", …) so the quotation reads price-list-wise. Groups keep
    // first-seen order; items with no price list fall under "Other".
    const renderGroupedItemRows = (rows) => {
        const groups = new Map();
        for (const item of rows) {
            const name = item.priceListName || "Other";
            if (!groups.has(name)) groups.set(name, []);
            groups.get(name).push(item);
        }
        return [...groups.entries()]
            .map(([name, groupRows]) => {
                const subtotal = sumRows(groupRows);
                const headerRow = `
    <tr style="page-break-inside: avoid; break-inside: avoid;">
      <td colspan="4" style="background: var(--card-bg); color: var(--heading); font-weight: bold; text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.4px; padding: 8px 0 8px 6px; border-bottom: 2px solid var(--accent);">${esc(name)}</td>
      <td class="pdf-amt" style="background: var(--card-bg); color: var(--accent); font-weight: bold; border-bottom: 2px solid var(--accent);">${money(subtotal)}</td>
    </tr>`;
                // Each group is its own <tbody> so it stays intact on one page.
                return `<tbody class="pl-group" style="page-break-inside: avoid; break-inside: avoid;">${headerRow}${renderItemRows(groupRows)}</tbody>`;
            })
            .join("");
    };

    const itemsHtml = renderGroupedItemRows(inclusionItems);
    const packageItemsHtml = renderItemRows(packageMappedItems, { bundled: true });

    // A framed image box (with placeholder + caption + sub-line) built from the
    // design system's image-card surface.
    const imageBox = (src, alt, placeholder, label, sub) => `
    <div class="pdf-image-card">
      ${src
            ? `<img src="${esc(src)}" alt="${esc(alt)}" />`
            : `<div class="pdf-empty" style="min-height: 150px;">${esc(placeholder)}</div>`
        }
      <p class="pdf-image-caption">${esc(label)}</p>
      <div style="font-size: 10px; color: var(--muted); margin-top: 4px;">${esc(sub)}</div>
    </div>`;

    // ── Totals ───────────────────────────────────────────────────────────────
    // These rows must account for every component of grand_total_cost, which SQL
    // computes as: package + inclusions + structure engineer + FACADE. The
    // facade row was missing entirely, so on any quotation with a priced facade
    // the sub-totals silently failed to add up to the Grand Total — the customer
    // saw an unexplained gap. The CRM's own quotation view has always shown this
    // row (pages/quotation/view/index.tsx); the PDF now matches it.
    const engineerPrice = amount(structuralEngineer?.price);
    const totalRows = [
        { label: "Value of Inclusions:", value: money(totalPricelistCost) },
    ];
    if (amount(totalPackageCost) > 0) {
        totalRows.push({ label: "Value of Package:", value: money(totalPackageCost) });
    }
    if (amount(facadePrice) !== 0) {
        totalRows.push({ label: "Facade Charges:", value: money(facadePrice) });
    }
    if (structuralEngineer || engineerPrice !== 0) {
        totalRows.push({
            label: "Structural Engineer Charges:",
            value: money(engineerPrice),
        });
    }

    // Guard against the totals block ever silently disagreeing with the sum of
    // its own rows again. grand_total_cost is computed in SQL; if a future
    // change adds a charge there without adding a row here, this logs loudly
    // instead of shipping a PDF the customer cannot reconcile.
    const rowsTotal =
        amount(totalPricelistCost) + amount(totalPackageCost) + amount(facadePrice) + engineerPrice;
    if (Math.abs(rowsTotal - amount(grandTotalCost)) > 0.01) {
        console.warn(
            `[quotation-pdf] v${quotationVersionNo}: totals do not reconcile — rows sum to ${rowsTotal.toFixed(2)} but grand total is ${amount(grandTotalCost).toFixed(2)} (difference ${(amount(grandTotalCost) - rowsTotal).toFixed(2)}).`,
        );
    }

    const termsUrl = buildTermsUrl(termsPublicToken);
    const termsHeading = termsTitle || "Terms & Conditions";
    const termsBlockHtml = termsUrl
        ? `
    ${sectionHeader(termsHeading)}
    ${card({
        bodyHtml: `
        <p style="margin: 0 0 8px 0; font-size: 11px; line-height: 1.6;">
          This quotation is issued subject to our ${esc(termsHeading)}, which form part of it.
          <a href="${esc(termsUrl)}" style="color: var(--accent); font-weight: bold; text-decoration: underline;">Click here to read the full ${esc(termsHeading)}</a>.
        </p>
        <p style="margin: 0; font-size: 9.5px; color: var(--muted); word-break: break-all;">
          ${esc(termsUrl)}
        </p>`,
    })}
    `
        : "";

    const bodyHtml = `
    ${brandHeader({
        logoHtml: brandLogoHtml(),
        title: "QUOTATION",
        metaHtml: docMetaLine("Version", quotationVersionNo) + docMetaLine("Date", date),
    })}
    ${pdfDivider()}

    <div class="pdf-grid-2">
      ${card({
        title: "Customer Information",
        bodyHtml: infoList(
            infoRow("Customer Name", contact.name || "N/A") +
            infoRow("Email Address", contact.email || "N/A") +
            infoRow("Phone Number", contact.phone || "N/A"),
        ),
    })}
      ${card({
        title: "Property Information",
        bodyHtml: infoList(
            infoRow("Lot Number", propertyDetail.lotNumber || "N/A") +
            infoRow("Street", propertyDetail.street || "N/A") +
            infoRow("City / Suburb", propertyDetail.city || "N/A") +
            infoRow("Postal Code", propertyDetail.zipCode || "N/A") +
            infoRow("Estate Name", propertyDetail.estateName || "N/A"),
        ),
    })}
    </div>

    ${sectionHeader("Design & Facade Options")}
    <div class="pdf-grid-2">
      ${imageBox(
        floorPlan.detailedImage || floorPlan.simpleImage,
        "Floor Plan",
        "No Floor Plan Image Available",
        `FLOOR PLAN: ${floorPlan.name || "N/A"}`,
        `Area: ${floorPlan.totalArea || "N/A"} sqm`,
    )}
      ${imageBox(
        facade.image,
        "Facade",
        "No Facade Image Available",
        `FACADE: ${facade.name || "N/A"}`,
        `Style: ${dwellingTypeName || "N/A"}`,
    )}
    </div>

    ${pkg?.name
            ? `
    ${sectionHeader("Selected Package")}
    ${card({
                bodyHtml: `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span class="pdf-card-heading" style="margin: 0;">${esc(pkg.name)}</span>
          <!-- totalPackageCost, not pkg.cost: it is the same figure the "Value of
               Package" total row uses, so the headline can never disagree with it. -->
          <span class="pdf-grand-value">${money(amount(totalPackageCost) || pkg.cost)}</span>
        </div>
        ${packageMappedItems.length ? pdfTable(tableHead, packageItemsHtml) : ""}
      `,
            })}
    `
            : ""
        }

    ${structuralEngineer
            ? `
    ${sectionHeader("Structural Engineer")}
    ${card({
                bodyHtml: infoList(
                    infoRow("Engineer", structuralEngineer?.name) +
                    infoRow("Service Price", money(engineerPrice), { accent: true }),
                ),
            })}
    `
            : ""
        }

    ${sectionHeader("Quotation Inclusions & Items")}
    <table class="pdf-table">
      <thead>${tableHead}</thead>
      ${itemsHtml}
    </table>

    ${totalsBlock({
            rows: totalRows,
            grandLabel: "Grand Total:",
            grandValue: money(grandTotalCost),
        })}

    ${termsBlockHtml}

    ${pdfFooter({
            title: "inBuildify",
            note: "Your Partner in Efficient Property Management  ·  This quotation is valid for 30 days from the date of issue. All prices are in AUD and inclusive of GST where applicable.",
        })}
  `;

    return renderPdfDocument({ title: `Quotation v${quotationVersionNo}`, bodyHtml });
};

export default { generateQuotationHTML };
