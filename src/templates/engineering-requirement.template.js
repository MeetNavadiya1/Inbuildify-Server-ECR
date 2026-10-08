/**
 * Engineering Requirement PDF template.
 *
 * Produces a complete, self-contained A4 HTML page (inline CSS only, no
 * external fonts or URLs) so it renders deterministically offline inside the
 * cached Puppeteer browser used by `generatePDF`.
 *
 * The caller (quotation.service.js -> generateEngineeringRequirement) builds a
 * flat `data` object from the QuotationVersion and its associations. Every
 * field is optional; missing values fall back to an em dash so the layout
 * never breaks.
 */

const PLACEHOLDER = "—";

/** Render a value, falling back to an em dash when null/undefined/empty. */
function val(value) {
  if (value === 0) return "0";
  if (value === null || value === undefined) return PLACEHOLDER;
  const str = String(value).trim();
  return str.length ? escapeHtml(str) : PLACEHOLDER;
}

/** Escape user/DB-sourced text so it can never break the surrounding markup. */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * A single label/value row, mirroring the old engineerPdfTemplate `info-item`
 * look: label on the left (muted), value on the right (bold). Pass
 * `highlight: true` to render the value in the brand blue.
 */
function field(label, value, highlight = false) {
  const valueColor = highlight ? "#0056b3" : "#1e293b";
  const valueWeight = highlight ? "700" : "600";
  return `
    <li style="display: flex; justify-content: space-between; padding: 8px 0; font-size: 13px; border-bottom: 1px dashed #e2e8f0;">
      <span style="font-weight: 500; color: #64748b;">${escapeHtml(label)}</span>
      <span style="font-weight: ${valueWeight}; color: ${valueColor}; text-align: right;">${val(value)}</span>
    </li>`;
}

/**
 * A titled card wrapping a set of fields, mirroring the old template's
 * `card` + `card-title` styling (light surface, rounded, bordered).
 */
function section(title, innerHtml) {
  return `
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px 20px; margin-bottom: 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
      <h3 style="font-size: 14px; font-weight: 700; color: #0f172a; margin: 0 0 12px 0; border-bottom: 1px solid #cbd5e1; padding-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">${escapeHtml(title)}</h3>
      <ul style="list-style: none; padding: 0; margin: 0;">
        ${innerHtml}
      </ul>
    </div>`;
}

/**
 * @param {object} data flat field bag (see quotation.service.js)
 * @returns {string} complete HTML document
 */
export function generateEngineeringRequirementHTML(data = {}) {
  const {
    // Header / meta
    referenceNumber,
    sketchNumber,
    generatedDate,
    // Client
    clientName,
    clientEmail,
    clientPhone,
    // Property
    propertyAddress,
    lotNumber,
    lotWidth,
    lotDepth,
    siteFall,
    landFill,
    // Selection
    locationName,
    rangeName,
    dwellingTypeName,
    packageName,
    facadeName,
    // Floor plan
    floorPlanName,
    beds,
    baths,
    carpark,
    dwellingArea,
    totalArea,
    garageArea,
    porchArea,
    alfrescoArea,
    minLandWidth,
    minLandDepth,
    // Engineer
    engineerName,
    engineerEmail,
    engineerPhone,
    engineerPrice,
  } = data;

  const m = (v) => (v === null || v === undefined || v === "" ? null : `${v} m`);
  const mm = (v) => (v === null || v === undefined || v === "" ? null : `${v} mm`);
  const m2 = (v) => (v === null || v === undefined || v === "" ? null : `${v} m²`);
  const money = (v) =>
    v === null || v === undefined || v === ""
      ? null
      : `$${Number(v).toLocaleString("en-AU")}`;

  // Header block reused as a titled section card.
  const headerSection = `
    <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #f1f5f9; padding-bottom: 20px; margin-bottom: 28px;">
      <div>
        <div style="font-size: 22px; font-weight: 800; color: #0056b3; letter-spacing: -1px;">inBuildify</div>
        <div style="font-size: 12px; color: #64748b; margin-top: 4px; font-weight: 500;">Structural Engineering Requirement</div>
      </div>
      <div style="text-align: right;">
        <h1 style="font-size: 22px; font-weight: 700; color: #0f172a; margin: 0; letter-spacing: -0.5px; text-transform: uppercase;">Engineering Requirement</h1>
        <p style="font-size: 11px; color: #64748b; margin: 6px 0 0 0;">Reference: ${val(referenceNumber)}</p>
        <p style="font-size: 11px; color: #64748b; margin: 2px 0 0 0;">Sketch No: ${val(sketchNumber)}</p>
        <p style="font-size: 11px; color: #64748b; margin: 2px 0 0 0;">Generated: ${val(generatedDate)}</p>
      </div>
    </div>`;

  /** A blue uppercase divider heading, like the old template's `section-header`. */
  const heading = (text) => `
    <div style="margin-top: 30px; margin-bottom: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; page-break-after: avoid;">
      <h2 style="font-size: 15px; font-weight: 700; color: #0056b3; margin: 0; text-transform: uppercase; letter-spacing: 1px;">${escapeHtml(text)}</h2>
    </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Engineering Requirement</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Helvetica, Arial, sans-serif; color: #1e293b; background: #ffffff; line-height: 1.5;">
  <div style="padding: 30px; max-width: 900px; margin: auto;">

    ${headerSection}

    <div style="height: 3px; background: linear-gradient(90deg, #0056b3, #4d90d1); border-radius: 2px; margin-bottom: 24px;"></div>

    ${heading("1. Client & Property")}
    ${section("Client", `
      ${field("Client Name", clientName)}
      ${field("Email", clientEmail)}
      ${field("Phone", clientPhone)}
    `)}
    ${section("Property Details", `
      ${field("Address", propertyAddress)}
      ${field("Lot Number", lotNumber)}
      ${field("Lot Width", m(lotWidth))}
      ${field("Lot Depth", m(lotDepth))}
      ${field("Site Fall", mm(siteFall))}
      ${field("Land Fill", mm(landFill))}
    `)}

    ${heading("2. Selection")}
    ${section("Range & Package", `
      ${field("Location", locationName)}
      ${field("Range", rangeName)}
      ${field("Dwelling Type", dwellingTypeName)}
      ${field("Package", packageName, true)}
      ${field("Facade", facadeName)}
    `)}

    ${heading("3. Floor Plan Specifications")}
    ${section(floorPlanName ? `Floor Plan — ${floorPlanName}` : "Floor Plan", `
      ${field("Beds", beds)}
      ${field("Baths", baths)}
      ${field("Car Park", carpark)}
      ${field("Dwelling Area", m2(dwellingArea))}
      ${field("Total Area", m2(totalArea), true)}
      ${field("Garage Area", m2(garageArea))}
      ${field("Porch Area", m2(porchArea))}
      ${field("Alfresco Area", m2(alfrescoArea))}
      ${field("Min Land Width", m(minLandWidth))}
      ${field("Min Land Depth", m(minLandDepth))}
    `)}

    ${heading("4. Structural Engineer")}
    ${section("Engineer Details", `
      ${field("Engineer", engineerName)}
      ${field("Email", engineerEmail)}
      ${field("Phone", engineerPhone)}
      ${field("Engineer Price", money(engineerPrice), true)}
    `)}

    <!-- Footer -->
    <div style="margin-top: 30px; padding-top: 12px; border-top: 1px solid #e2e8f0; text-align: center;">
      <div style="font-size: 10px; color: #94a3b8;">This document was generated automatically by inBuildify CRM for structural engineering review.</div>
    </div>

  </div>
</body>
</html>`;
}

export default generateEngineeringRequirementHTML;
