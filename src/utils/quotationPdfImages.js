import { Op } from "sequelize";
import sharp from "sharp";
import db from "../config/database/models/postgre-models/index.js";
import { getObject } from "../service/s3.service.js";
import { isUuid } from "../helper/imageDriveFile.helper.js";

/**
 * Inline the floor plan / facade images of a quotation version's details
 * object (the camelCased result of getQuotationVersionDetailsById) so
 * generateQuotationHTML renders them in Puppeteer.
 *
 * Why this exists: floor_plan.detailed_image / simple_image and facade.image
 * store DriveFile UUID FKs. The afterFind hook that rewrites them to S3 URLs
 * only fires on Sequelize finds — getQuotationVersionDetailsById is raw SQL,
 * so the template received bare UUIDs and the <img> tags rendered nothing.
 *
 * Mirrors the engineer-PDF fix (_buildEngineerPdfData): resolve UUIDs to
 * s3_keys in one batched query, then download and inline each image as a
 * base64 data URI (capped per download so a slow object can't stall PDF
 * generation — on failure the image is dropped, not the whole PDF).
 */
// 8s proved too tight on slow links — observed S3 downloads of ~800KB images
// taking 7-26s, which silently dropped every image from the PDF. Downloads run
// in parallel, so this caps the added wall time at the slowest single object.
const IMAGE_DL_TIMEOUT_MS = 45000;
const IMAGE_DL_ATTEMPTS = 2;

// Cache successful downloads by S3 key. Floor plan / facade uploads are
// immutable (a re-upload gets a new timestamped key), and re-downloading ~1MB
// objects over a slow link is the main reason images vanish from PDFs — once
// an image has downloaded successfully, every later PDF gets it instantly.
// Bounded FIFO eviction keeps memory modest (~30 × ~1MB data URIs).
const DATA_URI_CACHE_MAX = 30;
const dataUriCache = new Map();

const mimeFromKey = (k) => {
  const ext = (k || "").toLowerCase().split("?")[0].split(".").pop();
  switch (ext) {
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "png": return "image/png";
    case "gif": return "image/gif";
    case "webp": return "image/webp";
    case "svg": return "image/svg+xml";
    default: return "image/png";
  }
};

// Downscale + recompress before inlining. Raw uploads are ~850KB screenshots;
// embedding them verbatim produced 2.6MB PDFs, which made the engineer-email
// send (S3 download + SMTP upload of the attachment) outlast the devtunnel's
// gateway timeout. ~1200px JPEG is plenty for an A4 PDF rendering.
const MAX_IMG_WIDTH = 1200;
const optimizeImage = async (buf, mimeType) => {
  if (mimeType === "image/svg+xml") return { buf, mimeType }; // vector — leave as-is
  try {
    const out = await sharp(buf)
      .resize({ width: MAX_IMG_WIDTH, withoutEnlargement: true })
      .flatten({ background: "#ffffff" }) // JPEG has no alpha
      .jpeg({ quality: 75 })
      .toBuffer();
    if (out.length < buf.length) return { buf: out, mimeType: "image/jpeg" };
  } catch (err) {
    console.warn("[PdfImages] image optimize failed, using original:", err.message);
  }
  return { buf, mimeType };
};

/**
 * Convert an S3 URL or raw key into a base64 data URI so Puppeteer can render
 * the image without network access. Each attempt is capped so a slow object
 * can't stall PDF generation; on final failure the image is dropped (returns
 * null) rather than blocking the whole PDF.
 */
export const toDataUri = async (urlOrKey) => {
  if (!urlOrKey || typeof urlOrKey !== "string") return null;
  if (urlOrKey.startsWith("data:")) return urlOrKey;
  if (urlOrKey.startsWith("blob:")) return null;

  let key = urlOrKey;
  try {
    if (urlOrKey.startsWith("http://") || urlOrKey.startsWith("https://")) {
      const parsed = new URL(urlOrKey);
      key = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
    }
  } catch (_) {
    // treat as raw key
  }

  if (dataUriCache.has(key)) return dataUriCache.get(key);

  for (let attempt = 1; attempt <= IMAGE_DL_ATTEMPTS; attempt++) {
    try {
      const result = await Promise.race([
        getObject(key),
        new Promise((resolve) =>
          setTimeout(() => resolve({ success: false, error: "timeout" }), IMAGE_DL_TIMEOUT_MS),
        ),
      ]);
      if (result?.success && result?.data) {
        const ct = result.contentType;
        const rawMime = ct && ct.startsWith("image/") ? ct : mimeFromKey(key);
        const { buf, mimeType } = await optimizeImage(result.data, rawMime);
        const dataUri = `data:${mimeType};base64,${buf.toString("base64")}`;
        if (dataUriCache.size >= DATA_URI_CACHE_MAX) {
          dataUriCache.delete(dataUriCache.keys().next().value);
        }
        dataUriCache.set(key, dataUri);
        return dataUri;
      }
      console.warn(`[PdfImages] getObject failed/timeout for ${key} (attempt ${attempt}/${IMAGE_DL_ATTEMPTS}):`, result?.error);
    } catch (err) {
      console.error(`[PdfImages] Failed to inline image ${key} (attempt ${attempt}/${IMAGE_DL_ATTEMPTS}):`, err.message);
    }
  }
  return null;
};

export async function inlineQuotationPdfImages(versionDetails) {
  if (!versionDetails) return versionDetails;
  const floorPlan = versionDetails.floorPlan;
  const facade = versionDetails.facade;

  // 1. Resolve DriveFile UUIDs → s3_keys in one batched lookup.
  const uuids = [
    floorPlan?.detailedImage,
    floorPlan?.simpleImage,
    facade?.image,
  ].filter(isUuid);

  const uuidToKey = new Map();
  if (uuids.length) {
    const { DriveFile } = db.sequelize?.models || db;
    const rows = await DriveFile.findAll({
      where: { file_id: { [Op.in]: uuids } },
      attributes: ["file_id", "s3_key"],
    });
    rows.forEach((r) => uuidToKey.set(r.file_id, r.s3_key));
  }
  const resolveRef = (val) => (isUuid(val) ? uuidToKey.get(val) || null : val);

  // 2. Download and inline in parallel — each is an independent S3 round-trip.
  const [fpDetailed, facadeImg] = await Promise.all([
    floorPlan ? toDataUri(resolveRef(floorPlan.detailedImage)) : null,
    facade ? toDataUri(resolveRef(facade.image)) : null,
  ]);
  // The template only renders simpleImage when detailedImage is absent — skip
  // the download when the detailed image resolved, so it doesn't compete for
  // bandwidth with the images that actually render.
  const fpSimple = floorPlan && !fpDetailed
    ? await toDataUri(resolveRef(floorPlan.simpleImage))
    : null;

  if (floorPlan) {
    floorPlan.detailedImage = fpDetailed;
    floorPlan.simpleImage = fpSimple;
  }
  if (facade) {
    facade.image = facadeImg;
  }

  return versionDetails;
}

export default inlineQuotationPdfImages;
