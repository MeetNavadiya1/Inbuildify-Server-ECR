import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let cachedBrowser = null;
let browserLaunchPromise = null;

/**
 * Watermark configuration.
 *
 * Every value is overridable via an environment variable so the watermark can
 * be swapped or tuned without touching code. To use a different image, either
 * replace the default file below or point `PDF_WATERMARK_PATH` at the new one.
 *
 *   PDF_WATERMARK_ENABLED   "false" to turn the watermark off entirely
 *   PDF_WATERMARK_PATH      absolute/relative path to the image (png/jpg/svg/…)
 *   PDF_WATERMARK_OPACITY   0–1, how faint the watermark is (default 0.12)
 *   PDF_WATERMARK_WIDTH     watermark width as a % of the printable page (default 75)
 *   PDF_WATERMARK_ROTATION  rotation in degrees for the diagonal look (default -45)
 */
const num = (val, fallback) => (Number.isFinite(Number(val)) ? Number(val) : fallback);

const WATERMARK_CONFIG = {
  enabled: process.env.PDF_WATERMARK_ENABLED !== "false",
  // This file lives at src/modules/quotation/, the asset at src/assets/.
  imagePath:
    process.env.PDF_WATERMARK_PATH ||
    path.resolve(__dirname, "../../assets/logo-full.png"),
  opacity: num(process.env.PDF_WATERMARK_OPACITY, 0.12),
  widthPercent: num(process.env.PDF_WATERMARK_WIDTH, 140),
  rotationDeg: num(process.env.PDF_WATERMARK_ROTATION, -65),
};

const WATERMARK_MIME_BY_EXT = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

let cachedWatermarkDataUri = null;
let watermarkLoadFailed = false;

/**
 * Read the configured watermark image once and cache it as a base64 data URI so
 * it can be inlined into every PDF without any network/disk access per request.
 * A missing/unreadable image is non-fatal: PDFs simply render without it.
 */
const getWatermarkDataUri = () => {
  if (cachedWatermarkDataUri) return cachedWatermarkDataUri;
  if (watermarkLoadFailed) return null;
  try {
    const ext = path.extname(WATERMARK_CONFIG.imagePath).toLowerCase();
    const mime = WATERMARK_MIME_BY_EXT[ext] || "image/png";
    const buf = fs.readFileSync(WATERMARK_CONFIG.imagePath);
    cachedWatermarkDataUri = `data:${mime};base64,${buf.toString("base64")}`;
    return cachedWatermarkDataUri;
  } catch (err) {
    watermarkLoadFailed = true;
    console.warn(
      `[pdf] Watermark image could not be loaded from "${WATERMARK_CONFIG.imagePath}"; PDFs will render without a watermark:`,
      err.message,
    );
    return null;
  }
};

/**
 * Inject a page-repeating watermark behind the document content.
 *
 * The watermark is a `position: fixed` layer, which Chromium repeats on every
 * printed page. `z-index: -1` places it beneath the document's text and
 * graphics, and we force the page's own background transparent (keeping the
 * white fill on <html>) so the watermark shows through rather than being
 * painted over. The image is centered, rotated for a diagonal look, and scaled
 * to a large share of the page while preserving its aspect ratio (width driven,
 * height auto). Non-destructive: if the watermark is disabled or missing, the
 * original HTML is returned unchanged.
 */
export const injectWatermark = (htmlContent) => {
  if (!WATERMARK_CONFIG.enabled) return htmlContent;
  const dataUri = getWatermarkDataUri();
  if (!dataUri) return htmlContent;

  const { opacity, widthPercent, rotationDeg } = WATERMARK_CONFIG;

  const style = `
<style id="__pdf_watermark_style__">
  html { background: #ffffff !important; }
  body { background: transparent !important; }
  #__pdf_watermark__ {
    position: fixed;
    top: 50%;
    left: 50%;
    width: ${widthPercent}%;
    transform: translate(-50%, -50%) rotate(${rotationDeg}deg);
    transform-origin: center center;
    opacity: ${opacity};
    z-index: 99999;
    mix-blend-mode: multiply;
    pointer-events: none;
    margin: 0;
  }
  #__pdf_watermark__ img {
    display: block;
    width: 100%;
    height: auto;
  }
</style>`;

  const watermarkDiv = `<div id="__pdf_watermark__" aria-hidden="true"><img src="${dataUri}" alt="" /></div>`;

  let html = htmlContent;

  // Style goes at the end of <head> so its !important rules win over template
  // (and inline) backgrounds; fall back to prepending if there is no <head>.
  if (/<\/head>/i.test(html)) {
    html = html.replace(/<\/head>/i, `${style}</head>`);
  } else {
    html = style + html;
  }

  // The watermark element goes right after <body> so its fixed position is
  // relative to the page box; fall back to prepending the element.
  if (/<body[^>]*>/i.test(html)) {
    html = html.replace(/(<body[^>]*>)/i, `$1${watermarkDiv}`);
  } else {
    html = watermarkDiv + html;
  }

  return html;
};

/**
 * Universal print/pagination rules, injected into every PDF so all documents
 * paginate consistently without each template repeating the CSS:
 *   - headings never sit alone at the foot of a page (break-after: avoid)
 *   - table headers repeat on each page a table spills onto, and rows never
 *     split mid-row (tables still break BETWEEN rows)
 *   - compact "card"/summary/totals/terms blocks stay intact on one page;
 *     tables are deliberately excluded so long tables can still break
 *   - images never split; paragraphs keep 3-line orphans/widows
 *
 * These are additive hints: Chromium ignores a break-inside: avoid when the
 * block is taller than a page, so nothing can be forced off-page.
 */
const PRINT_RULES_STYLE = `
<style id="__pdf_print_rules__">
  h1, h2, h3, h4, h5, h6,
  .section-title, [class*="-title"], [class*="heading"] {
    break-after: avoid;
    page-break-after: avoid;
  }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  tr, img { break-inside: avoid; page-break-inside: avoid; }
  .section-no-break, .keep-together, .no-break, .card, .summary,
  .totals, .totals-container, .totals-table, .signature-block, .signature-section,
  [class*="card"], [class*="summary"], [class*="details"] {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  p, li, blockquote { orphans: 3; widows: 3; }
</style>`;

/**
 * Insert the universal print rules at the end of <head> so they win over any
 * earlier template rules. Falls back to prepending when there is no <head>.
 */
export const injectPrintRules = (htmlContent) => {
  if (/<\/head>/i.test(htmlContent)) {
    return htmlContent.replace(/<\/head>/i, `${PRINT_RULES_STYLE}</head>`);
  }
  return PRINT_RULES_STYLE + htmlContent;
};

// Default styling for a footer lifted into the page margin. The footerTemplate
// renders in an isolated context (the document's CSS does not apply), and
// Chromium defaults its font-size to 0 — so a size/colour/family must be set
// explicitly here or the footer renders invisibly.
const wrapMarginFooter = (innerHtml) =>
  `<div style="width:100%; box-sizing:border-box; font-size:8px; line-height:1.5; color:#888; text-align:center; font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; padding:0 15mm;">${innerHtml}</div>`;

/**
 * Get or launch the shared Puppeteer browser instance.
 * Concurrent callers share a single launch promise so we never spawn more than
 * one Chromium (launching is the most expensive step, ~2-5s cold).
 */
const getBrowser = async () => {
  if (cachedBrowser && cachedBrowser.connected) {
    return cachedBrowser;
  }
  if (browserLaunchPromise) {
    return browserLaunchPromise;
  }

  browserLaunchPromise = puppeteer
    .launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-zygote",
        "--disable-extensions",
        "--disable-background-networking",
      ],
    })
    .then((browser) => {
      cachedBrowser = browser;
      browser.on("disconnected", () => {
        cachedBrowser = null;
      });
      return browser;
    })
    .finally(() => {
      browserLaunchPromise = null;
    });

  return browserLaunchPromise;
};

/**
 * Launch the browser ahead of the first request so users never pay the cold
 * Chromium launch (~2-5s) inside a request. Safe to call at server startup;
 * failures are swallowed (the next getBrowser will retry).
 */
export const warmupBrowser = async () => {
  try {
    await getBrowser();
    console.log("[pdf] Puppeteer browser pre-warmed");
  } catch (err) {
    console.warn("[pdf] Browser pre-warm failed (will retry on demand):", err.message);
  }
};

/**
 * Generate PDF buffer from HTML content
 * @param {string} htmlContent - The HTML string to convert to PDF
 * @returns {Promise<Buffer>} - PDF buffer
 */
export const generatePDF = async (htmlContent) => {
  let page;
  const t0 = Date.now();
  try {
    const browser = await getBrowser();
    const tBrowser = Date.now();
    page = await browser.newPage();

    // All images are inlined as data URIs before we get here, so the PDF needs
    // no network access. Block any external (http/https) request as a hard
    // safeguard: a slow/blocked asset (e.g. a Google Fonts @import) under
    // "networkidle2" used to stall rendering until the 30s timeout and surface
    // as a 504. Aborting them keeps generation fast and deterministic.
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const url = req.url();
      if (url.startsWith("http://") || url.startsWith("https://")) {
        req.abort().catch(() => {});
      } else {
        req.continue().catch(() => {});
      }
    });

    // Add the background watermark (behind all content, repeated on every page)
    // and the universal print/pagination rules. Both inline everything, so this
    // adds no network/disk cost here.
    const preparedHtml = injectPrintRules(injectWatermark(htmlContent));

    // "load" fires once the DOM and inlined (data-URI) assets are ready. With
    // external requests aborted above there is nothing to wait on the network
    // for, so this resolves quickly instead of hanging on "networkidle2".
    await page.setContent(preparedHtml, { waitUntil: "load", timeout: 30000 });
    const tContent = Date.now();

    // Universal footer handling: lift the document's footer into the bottom page
    // margin so Chromium pins it to the bottom of every page — including the last
    // — instead of it floating right after the content with white space beneath.
    // Any template that marks its footer with [data-pdf-footer], .pdf-footer or a
    // plain .footer/<footer> gets this automatically; it's removed from the flow
    // so it never renders twice.
    const footerHtml = await page.evaluate(() => {
      const el = document.querySelector("[data-pdf-footer], .pdf-footer, .footer, footer");
      if (!el) return null;
      const html = el.innerHTML.trim();
      el.remove();
      return html;
    });

    const pdfOptions = {
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", right: "20mm", bottom: "20mm", left: "20mm" },
    };
    if (footerHtml) {
      pdfOptions.displayHeaderFooter = true;
      // Empty header suppresses Chromium's default date/URL header.
      pdfOptions.headerTemplate = "<span></span>";
      pdfOptions.footerTemplate = wrapMarginFooter(footerHtml);
      // Enlarge the bottom margin so the footer fits in the margin band.
      pdfOptions.margin.bottom = "28mm";
    }

    const pdfUint8Array = await page.pdf(pdfOptions);
    const tPdf = Date.now();

    console.log(
      `[pdf] timings ms — browser:${tBrowser - t0} setContent:${tContent - tBrowser} render:${tPdf - tContent} total:${tPdf - t0} htmlKB:${Math.round(htmlContent.length / 1024)}`,
    );

    return Buffer.from(pdfUint8Array);
  } catch (error) {
    console.error("Error generating PDF with Puppeteer:", error);
    // If the browser crashed, null it out so it regenerates next time
    cachedBrowser = null;
    throw new Error("Failed to generate PDF");
  } finally {
    if (page) {
      await page.close();
    }
  }
};
