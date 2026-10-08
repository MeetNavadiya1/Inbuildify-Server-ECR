/**
 * "Engineering Spec" (Structural Requirements Report) PDF.
 *
 * Rendered server-side by `pdf.service.generatePDF` (headless Chrome), which
 * injects the background watermark + universal print rules and lifts the
 * `.pdf-footer` into the page margin. All visual styling comes from the shared
 * PDF design system (utils/pdfDesignSystem.js) so this document matches the
 * Payment Receipt / TAX INVOICE family — amber `#f59e0b` accent, InBuildify
 * logo header, clean dividers, key/value rows, card surfaces and a repeating
 * footer.
 *
 * The data shape (nested `pdfData` built by quotation.service) and every field
 * it maps are unchanged from the previous version — only the presentation.
 *
 * @param {object} pdfData
 * @param {object} [pdfData.range]              - { name, logo_url, header_url }
 * @param {object} [pdfData.dwellingType]       - { name }
 * @param {object} [pdfData.floorPlan]          - dimensions, counts, images
 * @param {object} [pdfData.facade]             - { name, cost_type, cost, builder_cost, image }
 * @param {object} [pdfData.package]            - { name, cost, builder_cost }
 * @param {object} [pdfData.propertyDetail]     - lot/site/soil details
 * @param {*}      [pdfData.uploadReport]        - presence flips compaction status to "available"
 * @param {*}      [pdfData.structureEngineerReport] - presence flips compaction status to "available"
 * @returns {string} HTML string ready for Puppeteer
 */
import {
  renderPdfDocument,
  brandHeader,
  brandLogoHtml,
  pdfBanner,
  pdfDivider,
  sectionHeader,
  card,
  infoList,
  infoRow,
  imageCard,
  pdfFooter,
  esc,
} from "./pdfDesignSystem.js";

export const generateEngineerPdfHtml = (pdfData) => {
  const {
    range,
    dwellingType,
    floorPlan,
    facade,
    package: pkg,
    propertyDetail,
    uploadReport,
    structureEngineerReport,
  } = pdfData;

  const logoUrl = range?.logo_url || "";
  const headerUrl = range?.header_url || "";
  const compactionReportStatus =
    uploadReport || structureEngineerReport
      ? "available"
      : propertyDetail?.compaction_report || "not_available";

  // Number formatting preserved from the previous template (no forced decimals).
  const money = (n) => `$${parseFloat(n || 0).toLocaleString()}`;

  // ── General & Package details ──────────────────────────────────────────────
  const generalCard = card({
    title: "General Details",
    bodyHtml: infoList(
      infoRow("Range", range?.name || "N/A") + infoRow("Dwelling Type", dwellingType?.name || "N/A"),
    ),
  });

  const packageCard = card({
    title: "Package Details",
    bodyHtml: pkg
      ? infoList(
          infoRow("Package Name", pkg.name || "N/A", { accent: true }) +
            infoRow("Total Cost", money(pkg.cost)) +
            infoRow("Builder Cost", money(pkg.builder_cost)),
        )
      : `<div class="pdf-empty">No package selected</div>`,
  });

  // ── 1. Floor Plan ──────────────────────────────────────────────────────────
  const floorPlanImage = floorPlan?.detailed_image
    ? imageCard(floorPlan.detailed_image, "Detailed Layout View")
    : floorPlan?.simple_image
      ? imageCard(floorPlan.simple_image, "Floor Plan Layout")
      : "";

  const floorPlanCard = card({
    plain: true,
    bodyHtml: `
      <h3 class="pdf-card-heading">${esc(floorPlan?.name || "N/A")}</h3>
      ${floorPlan?.description ? `<p class="pdf-card-sub">${esc(floorPlan.description)}</p>` : ""}
      <div class="pdf-grid-2" style="margin-bottom:0;">
        ${infoList(
          infoRow("Min Land Width", `${floorPlan?.min_land_width || "N/A"} m`) +
            infoRow("Min Land Depth", `${floorPlan?.min_land_depth || "N/A"} m`) +
            infoRow("Total Area", `${floorPlan?.total_area || "N/A"} sqm`, { accent: true }) +
            infoRow("Dwelling Area", `${floorPlan?.dwelling_area || "N/A"} sqm`) +
            infoRow("Garage Area", `${floorPlan?.garage_area || "N/A"} sqm`) +
            infoRow("Porch Area", `${floorPlan?.porch_area || "N/A"} sqm`),
        )}
        ${infoList(
          infoRow("Bedrooms", floorPlan?.beds || "N/A") +
            infoRow("Bathrooms", floorPlan?.baths || "N/A") +
            infoRow("Living Areas", floorPlan?.living || "N/A") +
            infoRow("Carparks", floorPlan?.carpark || "N/A"),
        )}
      </div>
      ${floorPlanImage}
    `,
  });

  // ── 2. Facade ──────────────────────────────────────────────────────────────
  const facadeCard = card({
    plain: true,
    bodyHtml: `
      <h3 class="pdf-card-heading">${esc(facade?.name || "N/A")}</h3>
      <div class="pdf-grid-2" style="margin-bottom:0;">
        ${card({
          tight: true,
          bodyHtml: infoList(
            infoRow(
              "Cost Type",
              `<span style="text-transform:capitalize;">${esc(facade?.cost_type || "N/A")}</span>`,
              { raw: true },
            ),
          ),
        })}
        ${card({
          tight: true,
          bodyHtml: infoList(
            infoRow("Retail Cost", money(facade?.cost)) +
              infoRow("Builder Cost", money(facade?.builder_cost)),
          ),
        })}
      </div>
      ${imageCard(facade?.image, "External Facade Rendering")}
    `,
  });

  // ── 3. Property & Site ─────────────────────────────────────────────────────
  const soilEnvironmentCard = propertyDetail
    ? card({
        tight: true,
        bodyHtml: `
          <h4 class="pdf-mini-title">Soil &amp; Environment</h4>
          ${infoList(
            infoRow("Land Type / Classification", propertyDetail.land_type || "N/A", { accent: true }) +
              infoRow("Bush Fire Zone", propertyDetail.bush_fire ? "YES" : "NO", {
                danger: !!propertyDetail.bush_fire,
              }) +
              infoRow("Corner Block", propertyDetail.corner_block ? "YES" : "NO"),
          )}
        `,
      })
    : "";

  const compactionDownloadHtml = propertyDetail?.compaction_report_download_url
    ? `<a class="pdf-btn" href="${esc(propertyDetail.compaction_report_download_url)}" target="_blank">📥 Download Soil Report</a>`
    : `<div style="font-size:10.5px; color:var(--muted); font-style:italic;">No document link available</div>`;

  const compactionCard = propertyDetail
    ? card({
        tight: true,
        bodyHtml: `
          <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; height:100%;">
            <h4 class="pdf-mini-title">Soil Compaction Report</h4>
            <p style="font-size:10.5px; color:var(--muted); margin:0 0 14px;">
              Status: <strong style="color:var(--dark); text-transform:uppercase;">${esc(compactionReportStatus)}</strong>
            </p>
            ${compactionDownloadHtml}
          </div>
        `,
      })
    : "";

  const propertyCard = card({
    plain: true,
    bodyHtml: propertyDetail
      ? `
        <h3 class="pdf-card-heading">Lot ${esc(propertyDetail.lot_number || "N/A")}, ${esc(propertyDetail.street || "N/A")}</h3>
        <div class="pdf-grid-2" style="margin-bottom:0;">
          ${infoList(
            infoRow("Estate Name", propertyDetail.estate_name || "N/A") +
              infoRow("City / Suburb", propertyDetail.city || "N/A") +
              infoRow("Postcode", propertyDetail.zip_code || "N/A") +
              infoRow(
                "Title Status",
                `<span style="text-transform:uppercase;">${esc(propertyDetail.title_status || "N/A")}</span>`,
                { raw: true },
              ) +
              infoRow(
                "Title Date",
                propertyDetail.title_date
                  ? new Date(propertyDetail.title_date).toLocaleDateString()
                  : "N/A",
              ),
          )}
          ${infoList(
            infoRow("Land Width", `${propertyDetail.width_m || "N/A"} m`) +
              infoRow("Land Depth", `${propertyDetail.depth_m || "N/A"} m`) +
              infoRow("Total Size", `${propertyDetail.total_size_m2 || "N/A"} sqm`, { accent: true }) +
              infoRow("Site Fall", `${propertyDetail.site_fall_mm || "N/A"} mm`) +
              infoRow("Land Fill", `${propertyDetail.land_fill_mm || "N/A"} mm`),
          )}
        </div>
        <div class="pdf-grid-2" style="margin-top:20px; margin-bottom:0;">
          ${soilEnvironmentCard}
          ${compactionCard}
        </div>
      `
      : `<div class="pdf-empty">No property or site specifications listed.</div>`,
  });

  // ── Assemble document ──────────────────────────────────────────────────────
  const bodyHtml = `
    ${pdfBanner(headerUrl)}

    ${brandHeader({
      logoHtml: brandLogoHtml(logoUrl),
      title: "Engineering Spec",
      subtitle: "Structural Requirements Report",
    })}
    ${pdfDivider()}

    <div class="pdf-grid-2">
      ${generalCard}
      ${packageCard}
    </div>

    ${sectionHeader("1. Floor Plan Specifications")}
    ${floorPlanCard}

    <div class="pdf-page-break"></div>
    ${sectionHeader("2. Facade Specifications", { flush: true })}
    ${facadeCard}

    <div class="pdf-page-break"></div>
    ${sectionHeader("3. Property & Site Specifications", { flush: true })}
    ${propertyCard}

    ${pdfFooter({ title: "InBuildify", note: "Structural Requirements Report" })}
  `;

  return renderPdfDocument({ title: "Engineering Requirements", bodyHtml });
};

export default { generateEngineerPdfHtml };
