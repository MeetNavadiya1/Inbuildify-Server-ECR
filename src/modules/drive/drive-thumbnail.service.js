/**
 * Drive Thumbnail Service (Stage C3)
 *
 * Design:
 * - For images: uses `sharp` to resize in-memory to 320×320, then uploads to S3 immediately.
 * - For PDFs: marks the file as `thumbnail_status: 'pending'` and returns immediately.
 *   A separate async job should pick these up (see scheduleThumbnailGeneration below).
 * - For unsupported types: marks as `not_applicable`.
 * - Never blocks the upload response.
 *
 * Thumbnail S3 keys are private (not public). Access via signed URL.
 */

import db from "../../config/database/models/postgre-models/index.js";
import { uploadFile, generatePresignedDownloadUrl } from "../../service/s3.service.js";

const IMAGE_MIMES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const THUMBNAIL_WIDTH = 320;
const THUMBNAIL_HEIGHT = 320;

/**
 * Generate and upload a thumbnail for an image file buffer.
 * Returns the S3 key on success or null on failure.
 */
const generateImageThumbnail = async (fileBuffer, companyId, fileId) => {
  try {
    // Dynamic import so the module loads cleanly even if sharp is not installed
    const sharp = (await import("sharp")).default;

    const thumbBuffer = await sharp(fileBuffer)
      .resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    const thumbS3Key = `drive/thumbnails/${companyId}/${fileId}_thumb.jpg`;
    const result = await uploadFile(thumbS3Key, thumbBuffer, "image/jpeg");

    if (!result.success) {
      console.error("[Thumbnail] S3 upload failed:", result.error);
      return null;
    }
    return thumbS3Key;
  } catch (err) {
    console.error("[Thumbnail] Image generation error:", err.message);
    return null;
  }
};

/**
 * Entry point called immediately after a file is uploaded.
 * Runs asynchronously — never awaited by the upload handler.
 *
 * @param {Buffer}  fileBuffer  - The original file buffer (in memory)
 * @param {string}  mimeType    - The file MIME type
 * @param {string}  fileId      - The drive_files record ID
 * @param {string}  companyId
 */
export const scheduleThumbnailGeneration = async (fileBuffer, mimeType, fileId, companyId) => {
  const { DriveFile } = db.sequelize.models;

  try {
    if (IMAGE_MIMES.includes(mimeType)) {
      // Synchronous path for images — fast enough to run inline async
      const thumbKey = await generateImageThumbnail(fileBuffer, companyId, fileId);
      await DriveFile.update(
        {
          thumbnail_s3_key: thumbKey,
          thumbnail_status: thumbKey ? "done" : "failed",
        },
        { where: { file_id: fileId } }
      );
    } else if (mimeType === "application/pdf") {
      // PDFs are heavier — mark as pending for an external scheduled job
      // (e.g., a Bull queue job that uses pdf2pic / canvas)
      await DriveFile.update(
        { thumbnail_status: "pending" },
        { where: { file_id: fileId } }
      );
      console.log(`[Thumbnail] PDF thumbnail queued for file ${fileId}`);
    } else {
      await DriveFile.update(
        { thumbnail_status: "not_applicable" },
        { where: { file_id: fileId } }
      );
    }
  } catch (err) {
    console.error(`[Thumbnail] Error for file ${fileId}:`, err.message);
    await DriveFile.update(
      { thumbnail_status: "failed" },
      { where: { file_id: fileId } }
    ).catch(() => {});
  }
};

/**
 * Get a private signed URL for a file's thumbnail.
 */
export const getThumbnailUrlService = async (fileId, companyId) => {
  const { DriveFile } = db.sequelize.models;

  const file = await DriveFile.findOne({
    where: { file_id: fileId, company_id: companyId },
    attributes: ["thumbnail_s3_key", "thumbnail_status"],
  });

  if (!file) throw new Error("File not found.");

  if (!file.thumbnail_s3_key) {
    return { status: file.thumbnail_status || "not_applicable", url: null };
  }

  const result = await generatePresignedDownloadUrl(file.thumbnail_s3_key, 3600);
  return {
    status: "done",
    url: result.success ? result.url : null,
  };
};
