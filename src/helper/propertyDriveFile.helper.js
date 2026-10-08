import db from "../config/database/models/postgre-models/index.js";
import { DRIVE_FILE_MAPPING } from "../constants/driveFile.js";
import { env } from "../config/env.config.js";
import { isUuid } from "./imageDriveFile.helper.js";
import { buildDriveFileName, ensureUniqueDriveFileName } from "../service/fileNaming.service.js";
import { findOrCreateDriveFolder } from "./driveFolder.helper.js";

const REFERENCE_TYPE = DRIVE_FILE_MAPPING.REFERENCE_NAMES.PROPERTY_DETAIL;

const FOLDER_BY_SUB_REFERENCE = {
  [DRIVE_FILE_MAPPING.SUB_REFERENCES.COMPACTION_REPORT]: DRIVE_FILE_MAPPING.FOLDERS.COMPACTION_REPORTS,
};

/**
 * Extract relative S3 key from full HTTP(S) S3 URLs
 * Supports both domain-prefixed (bucket.s3.amazonaws.com) and path-prefixed (s3.amazonaws.com/bucket) S3 URLs
 */
export function getS3KeyFromUrl(fileUrl) {
  if (!fileUrl || typeof fileUrl !== "string") {
    return null;
  }
  if (!fileUrl.startsWith("http")) {
    return fileUrl;
  }
  try {
    const url = new URL(fileUrl);
    let key = decodeURIComponent(url.pathname.substring(1));
    const bucketName = env.AWS.S3_BUCKET_NAME;

    // If the bucket name is part of the hostname
    if (url.hostname.startsWith(`${bucketName}.`) || url.hostname.includes(`.${bucketName}.`)) {
      return key;
    }

    // If the bucket name is part of the pathname
    if (key.startsWith(`${bucketName}/`)) {
      key = key.substring(bucketName.length + 1);
    }
    return key;
  } catch (e) {
    return fileUrl;
  }
}

/**
 * Resolve a compaction_report_url column value into a real S3 key for presigning.
 *
 * After migration 20260527120000 the column is a UUID FK to drive_files.file_id.
 * The PropertyDetail afterFind hook rewrites that UUID into an absolute S3 URL,
 * but ONLY on direct queries — when PropertyDetail is loaded as a nested include
 * (e.g. through QuotationVersion → Quotation → Leads) the hook does not fire and
 * the value is still the raw UUID. Presigning that UUID as a key yields NoSuchKey.
 *
 * Handles all three shapes a caller might hold:
 *   - DriveFile UUID  → look up drive_files.s3_key
 *   - absolute S3 URL → strip to the key (hook already resolved it)
 *   - raw S3 key      → returned as-is
 *
 * @returns {Promise<string|null>} the S3 key, or null if it can't be resolved.
 */
export async function resolveCompactionS3Key(rawValue, { transaction } = {}) {
  if (!rawValue || typeof rawValue !== "string") {
    return null;
  }

  if (isUuid(rawValue)) {
    const { DriveFile } = db.sequelize.models;
    const file = await DriveFile.findOne({
      where: { file_id: rawValue },
      attributes: ["s3_key"],
      transaction,
    });
    return file?.s3_key || null;
  }

  // Absolute S3 URL or an already-bare key.
  return getS3KeyFromUrl(rawValue);
}

/**
 * Upsert a DriveFile linked to a PropertyDetail via the polymorphic
 * (reference_id, reference_type, sub_reference_type) tuple.
 */
export async function upsertPropertyDriveFile({
  propertyDetailId,
  subReferenceType = DRIVE_FILE_MAPPING.SUB_REFERENCES.COMPACTION_REPORT,
  s3Key,
  size = null,
  originalName = null,
  fileName = null,
  fileExtension = "pdf",
  mimeType = "application/pdf",
  companyId,
  builderId,
  leadId,
  uploadedBy = null,
  transaction = null,
}) {
  if (!propertyDetailId) throw new Error("upsertPropertyDriveFile: propertyDetailId is required");
  if (!s3Key) throw new Error("upsertPropertyDriveFile: s3Key is required");

  const { DriveFile } = db.sequelize.models;

  const folderName = FOLDER_BY_SUB_REFERENCE[subReferenceType];
  const folder = folderName
    ? await findOrCreateDriveFolder({
      name: folderName,
      companyId,
      builderId,
      createdBy: uploadedBy,
      transaction,
    })
    : null;

  const resolvedOriginalName = originalName || s3Key.split("/").pop() || `${subReferenceType}.pdf`;
  // Name from the administrator-configured format (Admin → Integration → File
  // Naming); `file_name` is UNIQUE, so de-duplicate before inserting.
  const resolvedFileName = fileName || await ensureUniqueDriveFileName(
    await buildDriveFileName({
      subReferenceType,
      companyId,
      builderId,
      leadId,
      propertyDetailId,
      originalName: resolvedOriginalName,
      extension: fileExtension,
      mimeType,
      transaction,
    }),
    { transaction },
  );

  const existing = await DriveFile.findOne({
    where: {
      reference_id: propertyDetailId,
      reference_type: REFERENCE_TYPE,
      sub_reference_type: subReferenceType,
    },
    transaction,
  });

  if (existing) {
    await existing.update(
      {
        s3_key: s3Key,
        size: size ?? existing.size,
        file_extension: fileExtension,
        mime_type: mimeType,
        folder_id: folder?.drive_id ?? existing.folder_id,
        company_id: companyId ?? existing.company_id,
        builder_id: builderId ?? existing.builder_id,
        lead_id: leadId ?? existing.lead_id,
        uploaded_by: uploadedBy ?? existing.uploaded_by,
      },
      { transaction },
    );
    return existing;
  }

  return DriveFile.create(
    {
      folder_id: folder?.drive_id ?? null,
      company_id: companyId,
      builder_id: builderId,
      lead_id: leadId,
      uploaded_by: uploadedBy,
      reference_id: propertyDetailId,
      reference_type: REFERENCE_TYPE,
      sub_reference_type: subReferenceType,
      original_name: resolvedOriginalName,
      file_name: resolvedFileName,
      s3_key: s3Key,
      file_extension: fileExtension,
      mime_type: mimeType,
      size,
    },
    { transaction },
  );
}

/**
 * Fetch the DriveFile a PropertyDetail currently points at via the polymorphic
 * (reference_id, reference_type, sub_reference_type) tuple. Returns the active
 * (non-deleted) row or null. Used to read the current s3_key before an upsert
 * replaces it (so the old S3 object can be cleaned up).
 */
export async function getPropertyDriveFile(
  propertyDetailId,
  subReferenceType = DRIVE_FILE_MAPPING.SUB_REFERENCES.COMPACTION_REPORT,
  { transaction } = {},
) {
  const { DriveFile } = db.sequelize.models;
  return DriveFile.findOne({
    where: {
      reference_id: propertyDetailId,
      reference_type: REFERENCE_TYPE,
      sub_reference_type: subReferenceType,
    },
    transaction,
  });
}

/**
 * Delete a DriveFile linked to a PropertyDetail.
 */
export async function deletePropertyDriveFile(
  propertyDetailId,
  subReferenceType = DRIVE_FILE_MAPPING.SUB_REFERENCES.COMPACTION_REPORT,
  { transaction } = {},
) {
  const { DriveFile } = db.sequelize.models;
  return DriveFile.destroy({
    where: {
      reference_id: propertyDetailId,
      reference_type: REFERENCE_TYPE,
      sub_reference_type: subReferenceType,
    },
    transaction,
  });
}
