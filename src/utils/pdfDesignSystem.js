/**
 * Shared PDF design system for the InBuildify document family.
 *
 * This is the single source of truth for the visual language shown on the
 * Payment Receipt / TAX INVOICE (amber `#f59e0b` accent, InBuildify logo header,
 * clean dividers, key/value rows, "card" surfaces and a repeating page footer).
 * Any backend Puppeteer HTML template can compose these helpers so every
 * generated PDF looks like it belongs to the same family.
 *
 * Rendered by `pdf.service.generatePDF` (headless Chrome), which:
 *   - injects the background watermark and universal print rules for us, and
 *   - lifts any `.pdf-footer`/`.footer`/`footer` element into the bottom page
 *     margin so it repeats on every page.
 * That renderer aborts every http(s) request, so this module inlines the brand
 * logo as a base64 data URI and uses a system font stack — no remote assets.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Small helpers ────────────────────────────────────────────────────────────

/** Escape DB/user text so it can never break the surrounding markup. */
export const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Coerce to a finite number or fall back. */
export const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

// ─── Brand logo (inlined) ─────────────────────────────────────────────────────

const BRAND_LOGO_PATH = path.resolve(__dirname, "../assets/logo-full.png");
let cachedLogoDataUri = null;
let logoLoadFailed = false;

/**
 * Read the InBuildify logo once and cache it as a base64 data URI so it can be
 * inlined into the header of every PDF without any network/disk cost per
 * request. A missing/unreadable file is non-fatal — callers fall back to the
 * text wordmark.
 */
export function getBrandLogoDataUri() {
  if (cachedLogoDataUri) return cachedLogoDataUri;
  if (logoLoadFailed) return null;
  try {
    const buf = fs.readFileSync(BRAND_LOGO_PATH);
    cachedLogoDataUri = `data:image/png;base64,${buf.toString("base64")}`;
    return cachedLogoDataUri;
  } catch (err) {
    logoLoadFailed = true;
    console.warn(
      `[pdf] Brand logo could not be loaded from "${BRAND_LOGO_PATH}"; falling back to wordmark:`,
      err.message,
    );
    return null;
  }
}

/**
 * Header logo markup. Prefers a caller-supplied logo (e.g. a range's own brand
 * logo) to preserve per-document branding; otherwise inlines the InBuildify
 * logo, and finally falls back to the amber "InBuildify" wordmark.
 */
export function brandLogoHtml(customLogoUrl) {
  if (customLogoUrl) return `<img class="pdf-brand-img" src="${esc(customLogoUrl)}" alt="Company logo" />`;
  const dataUri = getBrandLogoDataUri();
  if (dataUri) return `<img class="pdf-brand-img" src="${dataUri}" alt="InBuildify" />`;
  return `<div class="pdf-wordmark">In<span>Buildify</span></div>`;
}

// ─── Design tokens + component styles ─────────────────────────────────────────

/**
 * The design-system stylesheet. Inline it once into a document's <head> via
 * `renderPdfDocument`. Colours mirror the Payment Receipt exactly.
 */
export const pdfBaseStyles = `
:root {
  --accent: #f59e0b;
  --dark: #1f2937;
  --heading: #111827;
  --muted: #6b7280;
  --border: #e5e7eb;
  --card-bg: #f9fafb;
  --danger: #ef4444;
  color-scheme: light only;
}
* { box-sizing: border-box; }
html { background: #ffffff; }
body {
  font-family: Helvetica, Arial, sans-serif;
  color: var(--dark);
  line-height: 1.5;
  margin: 0;
  padding: 0;
  font-size: 11px;
  background: #ffffff;
}
/* Content spans the full printable width; page margins come from page.pdf(). */
.pdf-page { width: 100%; }

/* Header ------------------------------------------------------------------- */
.pdf-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 22px;
}
.pdf-brand { display: flex; align-items: center; }
.pdf-brand-img { height: 46px; width: auto; object-fit: contain; display: block; }
.pdf-wordmark { font-size: 22px; font-weight: bold; letter-spacing: -0.5px; color: var(--dark); }
.pdf-wordmark span { color: var(--accent); }
.pdf-doc-meta { text-align: right; }
.pdf-doc-title {
  font-size: 22px;
  font-weight: bold;
  color: var(--accent);
  letter-spacing: 1px;
  text-transform: uppercase;
  line-height: 1.1;
  margin: 0 0 6px;
}
.pdf-doc-subtitle { font-size: 11px; color: var(--muted); margin: 0 0 4px; }
.pdf-doc-meta p { margin: 0 0 3px; font-size: 10px; color: var(--muted); }

/* Divider + optional banner ------------------------------------------------ */
.pdf-divider { border-top: 1px solid var(--border); margin: 0 0 26px; }
.pdf-banner { width: 100%; text-align: center; margin-bottom: 22px; border-radius: 10px; overflow: hidden; }
.pdf-banner img { max-width: 100%; height: auto; max-height: 120px; object-fit: contain; }

/* Layout ------------------------------------------------------------------- */
.pdf-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; margin-bottom: 26px; }

/* Cards -------------------------------------------------------------------- */
.pdf-card {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 22px 24px;
  page-break-inside: avoid;
}
.pdf-card--plain { background: #ffffff; }
.pdf-card--tight { padding: 16px 18px; }
.pdf-card-title {
  font-size: 12px;
  font-weight: bold;
  color: var(--heading);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  margin: 0 0 14px;
  padding-bottom: 9px;
  border-bottom: 2px solid var(--accent);
}
.pdf-card-heading { margin: 0 0 6px; font-size: 16px; font-weight: bold; color: var(--heading); }
.pdf-card-sub { font-size: 10.5px; color: var(--muted); margin: 0 0 16px; line-height: 1.6; }
.pdf-mini-title {
  margin: 0 0 10px;
  font-size: 11px;
  font-weight: bold;
  color: var(--heading);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Key / value rows --------------------------------------------------------- */
.pdf-list { list-style: none; padding: 0; margin: 0; }
.pdf-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 16px;
  padding: 9px 0;
  font-size: 10.5px;
  border-bottom: 1px solid var(--border);
}
.pdf-row:last-child { border-bottom: none; }
.pdf-k { color: var(--muted); font-weight: 500; }
.pdf-v { color: var(--dark); font-weight: bold; text-align: right; }
.pdf-v-accent { color: var(--accent); }
.pdf-v-danger { color: var(--danger); }

/* Section headers ---------------------------------------------------------- */
.pdf-section {
  margin: 34px 0 18px;
  padding-bottom: 9px;
  border-bottom: 2px solid var(--accent);
  page-break-after: avoid;
}
.pdf-section--flush { margin-top: 0; }
.pdf-section h2 {
  margin: 0;
  font-size: 13px;
  font-weight: bold;
  color: var(--dark);
  text-transform: uppercase;
  letter-spacing: 1px;
}

/* Image + empty + button + footer ------------------------------------------ */
.pdf-image-card {
  background: #ffffff;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  margin-top: 18px;
  text-align: center;
  page-break-inside: avoid;
}
.pdf-image-card img { max-width: 100%; height: auto; max-height: 300px; border-radius: 6px; object-fit: contain; }
.pdf-image-caption {
  font-size: 10px;
  font-weight: bold;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 12px 0 0;
}
.pdf-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 80px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 500;
  text-align: center;
}
.pdf-btn {
  display: inline-block;
  background: var(--accent);
  color: #ffffff;
  text-decoration: none;
  padding: 9px 18px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: bold;
}
.pdf-footer { text-align: center; }

/* Address blocks (e.g. BILLED TO / FROM) ----------------------------------- */
.pdf-addresses { display: flex; justify-content: space-between; margin-bottom: 26px; page-break-inside: avoid; }
.pdf-addr { width: 48%; }
.pdf-addr--right { text-align: right; }
.pdf-addr-title { font-size: 10px; font-weight: bold; color: var(--muted); text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 6px; }
.pdf-addr-name { font-size: 11px; font-weight: bold; color: var(--dark); margin-bottom: 3px; }
.pdf-addr-line { font-size: 10px; color: var(--muted); margin-bottom: 3px; }

/* Reference strip ---------------------------------------------------------- */
.pdf-refs { background: var(--card-bg); border-radius: 6px; padding: 12px 14px; margin-bottom: 22px; page-break-inside: avoid; }
.pdf-refs-row { display: flex; justify-content: space-between; font-size: 10px; font-weight: bold; color: var(--dark); }
.pdf-refs-sub { margin-top: 6px; font-size: 9px; color: var(--muted); font-weight: normal; }

/* Data table (amber underlined header, like the receipt) -------------------- */
.pdf-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
.pdf-table thead th {
  border-bottom: 2px solid var(--accent);
  padding: 0 0 8px;
  font-size: 10.5px;
  font-weight: bold;
  color: var(--dark);
  text-align: left;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}
.pdf-table tbody td { border-bottom: 1px solid var(--border); padding: 10px 0; font-size: 10px; color: var(--dark); vertical-align: top; }
.pdf-table tbody tr:last-child td { border-bottom: none; }
.pdf-table tr { page-break-inside: avoid; }
.pdf-amt { text-align: right; }
.pdf-table td.pdf-amt { font-weight: bold; }
.pdf-table th.pdf-amt { text-align: right; }

/* Totals ------------------------------------------------------------------- */
.pdf-totals { display: flex; justify-content: flex-end; margin-top: 20px; page-break-inside: avoid; }
.pdf-totals-table { width: 260px; }
.pdf-totals-row { display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 6px; }
.pdf-totals-row .pdf-k { color: var(--muted); font-weight: 500; }
.pdf-totals-row .pdf-v { font-weight: bold; }
.pdf-grand { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border); margin-top: 10px; padding-top: 10px; }
.pdf-grand-label { font-size: 12px; font-weight: bold; color: var(--dark); }
.pdf-grand-value { font-size: 16px; font-weight: bold; color: var(--accent); }

/* Bank + payment-terms panels ---------------------------------------------- */
.pdf-bank { background: #f8fafc; border-left: 3px solid var(--accent); border-radius: 6px; padding: 15px; margin-top: 32px; page-break-inside: avoid; }
.pdf-bank-title { font-size: 10px; font-weight: bold; color: var(--dark); margin-bottom: 4px; }
.pdf-bank-line { font-size: 9.5px; color: var(--muted); }
.pdf-terms { padding-left: 15px; margin-top: 15px; page-break-inside: avoid; }
.pdf-terms-title { font-size: 10px; font-weight: bold; color: var(--dark); margin-bottom: 4px; }
.pdf-terms-text { font-size: 9.5px; color: var(--muted); }
.pdf-terms-date { font-weight: bold; color: var(--danger); }

/* Signature blocks --------------------------------------------------------- */
.pdf-signatures { display: flex; justify-content: space-between; gap: 30px; margin-top: 40px; page-break-inside: avoid; }
.pdf-signature { width: 48%; }
.pdf-signature-line { border-top: 1px solid var(--dark); margin-top: 36px; padding-top: 6px; font-size: 10px; color: var(--muted); }

/* Page-break utility ------------------------------------------------------- */
.pdf-page-break { page-break-before: always; }
`;

// ─── Component builders ───────────────────────────────────────────────────────

/** Full self-contained A4 document wrapping `bodyHtml` with the shared styles. */
export function renderPdfDocument({ title = "Document", bodyHtml = "", extraStyles = "" } = {}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="color-scheme" content="light only" />
  <title>${esc(title)}</title>
  <style>${pdfBaseStyles}${extraStyles}</style>
</head>
<body>
  <div class="pdf-page">
    ${bodyHtml}
  </div>
</body>
</html>`;
}

/** Optional full-width banner image (e.g. a range header artwork). */
export function pdfBanner(bannerUrl) {
  if (!bannerUrl) return "";
  return `<div class="pdf-banner"><img src="${esc(bannerUrl)}" alt="Header banner" /></div>`;
}

/**
 * The document header: brand logo on the left, document title / subtitle and
 * any meta lines on the right — the exact arrangement used on the receipt.
 * `metaHtml` is raw markup (e.g. `<p>Reference: …</p>` lines).
 */
export function brandHeader({ logoHtml, title, subtitle = "", metaHtml = "" }) {
  return `
  <div class="pdf-header">
    <div class="pdf-brand">${logoHtml}</div>
    <div class="pdf-doc-meta">
      <div class="pdf-doc-title">${esc(title)}</div>
      ${subtitle ? `<div class="pdf-doc-subtitle">${esc(subtitle)}</div>` : ""}
      ${metaHtml}
    </div>
  </div>`;
}

/** Thin full-width rule matching the receipt's header divider. */
export const pdfDivider = () => `<div class="pdf-divider"></div>`;

/**
 * A titled section rule (dark uppercase label under an amber underline),
 * echoing the receipt's amber table-header accent. `flush: true` drops the top
 * margin for a section that starts a fresh page.
 */
export function sectionHeader(title, { flush = false } = {}) {
  return `<div class="pdf-section${flush ? " pdf-section--flush" : ""}"><h2>${esc(title)}</h2></div>`;
}

/** A surface card. `plain` = white background, `tight` = reduced padding. */
export function card({ title = "", bodyHtml = "", plain = false, tight = false } = {}) {
  const cls = ["pdf-card", plain ? "pdf-card--plain" : "", tight ? "pdf-card--tight" : ""]
    .filter(Boolean)
    .join(" ");
  return `<div class="${cls}">${title ? `<h3 class="pdf-card-title">${esc(title)}</h3>` : ""}${bodyHtml}</div>`;
}

/** Wrap key/value `<li>` rows in a list. */
export const infoList = (rowsHtml) => `<ul class="pdf-list">${rowsHtml}</ul>`;

/**
 * A single key/value row. `accent`/`danger` colour the value; `raw: true`
 * treats `value` as pre-built HTML (otherwise it is escaped).
 */
export function infoRow(label, value, { accent = false, danger = false, raw = false } = {}) {
  const valueCls = ["pdf-v", accent ? "pdf-v-accent" : "", danger ? "pdf-v-danger" : ""]
    .filter(Boolean)
    .join(" ");
  const rendered = raw ? String(value ?? "") : esc(value ?? "");
  return `<li class="pdf-row"><span class="pdf-k">${esc(label)}</span><span class="${valueCls}">${rendered}</span></li>`;
}

/** A framed image with an uppercase caption. */
export function imageCard(src, caption) {
  if (!src) return "";
  return `<div class="pdf-image-card"><img src="${esc(src)}" alt="${esc(caption || "")}" />${
    caption ? `<p class="pdf-image-caption">${esc(caption)}</p>` : ""
  }</div>`;
}

/**
 * A repeating page footer. `generatePDF` lifts this into the bottom page margin
 * and renders it small/grey/centred on every page, so keep the content concise.
 * Page numbers use Chromium's special `pageNumber`/`totalPages` classes.
 */
export function pdfFooter({ title = "InBuildify", note = "", pageNumbers = true } = {}) {
  const parts = [`<strong>${esc(title)}</strong>`];
  if (note) parts.push(esc(note));
  if (pageNumbers) parts.push(`Page <span class="pageNumber"></span> of <span class="totalPages"></span>`);
  return `<div class="pdf-footer">${parts.join(" &nbsp;·&nbsp; ")}</div>`;
}

/** A single header meta line, e.g. `Invoice No: LD-001`. */
export const docMetaLine = (label, value) => `<p>${esc(label)}: ${esc(value)}</p>`;

/**
 * One address column (e.g. BILLED TO / FROM). `lines` is an array of strings;
 * empty/blank lines are dropped. `align: "right"` right-aligns the column.
 */
export function addressBlock({ title, name = "", lines = [], align = "left" } = {}) {
  const body = lines
    .filter((l) => l !== null && l !== undefined && String(l).trim() !== "")
    .map((l) => `<div class="pdf-addr-line">${esc(l)}</div>`)
    .join("");
  return `<div class="pdf-addr${align === "right" ? " pdf-addr--right" : ""}">
    <div class="pdf-addr-title">${esc(title)}</div>
    ${name ? `<div class="pdf-addr-name">${esc(name)}</div>` : ""}
    ${body}
  </div>`;
}

/** The two-column address row wrapper. Pass rendered `addressBlock` markup. */
export const addresses = (leftHtml, rightHtml) =>
  `<div class="pdf-addresses">${leftHtml}${rightHtml}</div>`;

/** The reference strip (left/right bold refs with an optional muted sub-line). */
export function refsBox({ left = "", right = "", sub = "" } = {}) {
  return `<div class="pdf-refs">
    <div class="pdf-refs-row"><span>${esc(left)}</span><span>${esc(right)}</span></div>
    ${sub ? `<div class="pdf-refs-sub">${esc(sub)}</div>` : ""}
  </div>`;
}

/** A data table with an amber-underlined header. `headHtml`/`bodyHtml` are raw `<tr>` markup. */
export const pdfTable = (headHtml, bodyHtml) =>
  `<table class="pdf-table"><thead>${headHtml}</thead><tbody>${bodyHtml}</tbody></table>`;

/**
 * The right-aligned totals block. `rows` = [{ label, value }] muted sub-totals;
 * `grandLabel`/`grandValue` render the emphasised amber grand total.
 */
export function totalsBlock({ rows = [], grandLabel = "", grandValue = "" } = {}) {
  const sub = rows
    .map((r) => `<div class="pdf-totals-row"><span class="pdf-k">${esc(r.label)}</span><span class="pdf-v">${esc(r.value)}</span></div>`)
    .join("");
  const grand = grandLabel
    ? `<div class="pdf-grand"><span class="pdf-grand-label">${esc(grandLabel)}</span><span class="pdf-grand-value">${esc(grandValue)}</span></div>`
    : "";
  return `<div class="pdf-totals"><div class="pdf-totals-table">${sub}${grand}</div></div>`;
}

/** The bank-details panel (amber left rule), matching the invoice. */
export function bankPanel({ title, lines = [] } = {}) {
  const body = lines
    .filter(Boolean)
    .map((l) => `<div class="pdf-bank-line">${esc(l)}</div>`)
    .join("");
  return `<div class="pdf-bank">${title ? `<div class="pdf-bank-title">${esc(title)}</div>` : ""}${body}</div>`;
}

export default {
  esc,
  num,
  getBrandLogoDataUri,
  brandLogoHtml,
  pdfBaseStyles,
  renderPdfDocument,
  pdfBanner,
  brandHeader,
  pdfDivider,
  sectionHeader,
  card,
  infoList,
  infoRow,
  imageCard,
  pdfFooter,
  docMetaLine,
  addressBlock,
  addresses,
  refsBox,
  pdfTable,
  totalsBlock,
  bankPanel,
};
