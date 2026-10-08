import { randomUUID } from "crypto";

import { Op } from "sequelize";
import db from "../config/database/models/postgre-models/index.js";
import { env } from "../config/env.config.js";
import { deleteFromS3, copyS3Object } from "../utils/s3Upload.js";
import { ensureUniqueDriveFileName } from "../service/fileNaming.service.js";
import { runSampleDataMaintenance } from "../config/database/models/postgre-models/sampleDataFlag.js";

/**
 * Shared DriveFile helpers for "master data" image columns (Facade.image,
 * FloorPlan.detailed_image / simple_image).
 *
 * Those columns store a DriveFile primary key (UUID FK); the real file lives in
 * drive_files. This module centralises the three things every facade /
 * floor-plan flow used to re-implement inline:
 *   1. resolving the stored UUID → absolute S3 URL on read (afterFind),
 *   2. creating a DriveFile row for a freshly uploaded image,
 *   3. deleting the file an image column currently points at.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value) => typeof value === "string" && UUID_RE.test(value);

export const s3UrlForKey = (s3Key) =>
  s3Key ? `https://${env.AWS.S3_BUCKET_NAME}.s3.amazonaws.com/${s3Key}` : null;

/**
 * afterFind hook body: replace each UUID-valued image column with its absolute
 * S3 URL. Every UUID across all rows and all `fields` is resolved with a single
 * batched DriveFile query.
 *
 * Pass `skipImageResolve: true` in the query options when the caller needs the
 * raw FK rather than a URL — e.g. when the row is about to be re-inserted as a
 * copy, since a URL string cannot go back into a UUID column.
 *
 * @param {object|object[]|null} results  the afterFind payload
 * @param {string[]} fields               image columns to resolve (e.g. ["image"])
 * @param {import("sequelize").Sequelize} sequelize
 * @param {object} [options]              the query options ({ transaction, skipImageResolve })
 */
export async function resolveImageUrls(results, fields, sequelize, options = {}) {
  if (!results) return;
  if (options?.skipImageResolve) return;
  const transaction = options?.transaction;
  const { DriveFile } = sequelize.models;
  if (!DriveFile) return;

  const instances = Array.isArray(results) ? results : [results];

  const ids = new Set();
  for (const inst of instances) {
    if (!inst) continue;
    for (const field of fields) {
      if (isUuid(inst[field])) ids.add(inst[field]);
    }
  }
  if (ids.size === 0) return;

  const driveFiles = await runSampleDataMaintenance(() =>
    DriveFile.findAll({
      where: { file_id: { [Op.in]: [...ids] } },
      attributes: ["file_id", "s3_key"],
      transaction,
    })
  );
  const keyById = new Map(driveFiles.map((f) => [f.file_id, f.s3_key]));

  for (const inst of instances) {
    if (!inst) continue;
    for (const field of fields) {
      if (isUuid(inst[field])) {
        inst[field] = s3UrlForKey(keyById.get(inst[field]));
      }
    }
  }
}

/**
 * Create a DriveFile row for an uploaded image (a multer-s3 file object) and
 * return the created instance. Pass `fileId` to pre-assign the PK so the parent
 * row can be inserted in one shot with its image FK already populated.
 */
export async function createImageDriveFile(
  {
    file,
    fileId = null,
    companyId,
    builderId,
    uploadedBy,
    referenceId,
    referenceType,
    subReferenceType,
    subReferenceId = null,
    namePrefix,
    // Which S Drive folder the file lands in. Left null by every caller that
    // only wants the file attached to its record — the file is then reachable
    // through that record's own Documents tab but not from the drive tree.
    folderId = null,
  },
  transaction,
) {
  // multer-s3 already named the object after the administrator-configured format
  // (see s3Upload.js), so the key's basename *is* the configured name. Fall back
  // to the legacy prefixed name only if the key is missing. `file_name` is
  // UNIQUE, so de-duplicate before inserting.
  const configuredName = file.key
    ? file.key.split("/").pop()
    : `${namePrefix}_${Date.now()}_${file.originalname}`;

  return db.DriveFile.create(
    {
      ...(fileId ? { file_id: fileId } : {}),
      company_id: companyId,
      builder_id: builderId,
      uploaded_by: uploadedBy,
      original_name: file.originalname,
      file_name: await ensureUniqueDriveFileName(configuredName, { transaction, companyId }),
      s3_key: file.key,
      file_extension: file.originalname.split(".").pop(),
      mime_type: file.mimetype,
      size: file.size,
      folder_id: folderId,
      reference_id: referenceId,
      reference_type: referenceType,
      sub_reference_id: subReferenceId,
      sub_reference_type: subReferenceType,
    },
    { transaction },
  );
}

/**
 * Duplicate the DriveFile an image column points at, for a different owner.
 *
 * Used when a row that owns an image is cloned across companies (sample-data
 * import). The clone gets its own drive_files row AND its own S3 object, so the
 * two tenants share nothing: deleting or replacing one image can never remove
 * the file the other is still pointing at.
 *
 * @returns {Promise<string|null>} the new DriveFile PK, or null when there is
 *   nothing to clone (no source, missing row) or the S3 copy failed — callers
 *   should then leave the image column NULL rather than reuse the source FK.
 */
// export async function cloneImageDriveFile(
//   { sourceFileId, companyId, builderId, uploadedBy, referenceId, leadId = null },
//   transaction,
// ) {
export async function cloneImageDriveFile(
  { sourceFileId, companyId, builderId, uploadedBy, referenceId, leadId = null, folderMapping = null },
  transaction,
) {
  if (!isUuid(sourceFileId)) return null;

  const source = await db.DriveFile.findOne({
    where: { file_id: sourceFileId },
    transaction,
  });
  if (!source || !source.s3_key) return null;

  // Same folder, new basename — the key must be unique so the copies stay
  // independently deletable.
  const newFileId = randomUUID();
  const slash = source.s3_key.lastIndexOf("/");
  const folder = slash >= 0 ? source.s3_key.slice(0, slash + 1) : "";
  const basename = slash >= 0 ? source.s3_key.slice(slash + 1) : source.s3_key;
  const destinationKey = `${folder}${newFileId}-${basename}`;

  const copiedKey = await copyS3Object(source.s3_key, destinationKey);
  if (!copiedKey) return null;

  const created = await db.DriveFile.create(
    {
      file_id: newFileId,
      company_id: companyId,
      builder_id: builderId,
      uploaded_by: uploadedBy,
      lead_id: leadId,
      // A source file filed under an S Drive folder keeps its place in the
      // cloned tree; without this the copy lands folder-less and My Drive,
      // which lists strictly by folder, never shows it.
      folder_id: (folderMapping && source.folder_id && folderMapping[source.folder_id]) || null,
      original_name: source.original_name,
      file_name: await ensureUniqueDriveFileName(source.file_name, { transaction, companyId }),
      s3_key: copiedKey,
      file_extension: source.file_extension,
      mime_type: source.mime_type,
      size: source.size,
      reference_id: referenceId,
      reference_type: source.reference_type,
      sub_reference_type: source.sub_reference_type,
      // Only the sample-data importer clones DriveFiles, so every row this
      // helper writes is seeded by definition.
      is_sample_data: true,
    },
    { transaction },
  );

  return created.file_id;
}

/**
 * Duplicate a DriveFile row wholesale — a document in the Drive tree rather than
 * an image hanging off a master-data column.
 *
 * cloneImageDriveFile above is driven by an image column: it looks the source up
 * by id, re-points reference_id at the row that owns the image, and never sets
 * folder_id. That is right for an image and wrong for a document, which needs to
 * keep its folder and its own reference. The Documents screen lists files
 * regardless of folder, so a file cloned without one exists but sits outside the
 * tree.
 *
 * @returns {Promise<string|null>} the new DriveFile PK, or null if the S3 copy failed
 */
export async function cloneDriveFileRow(
  {
    source, companyId, builderId, uploadedBy,
    folderId = null, referenceId = null, leadId = null,
    // Set from the source's own deleted_at so a document the demo account has
    // in Trash arrives in Trash rather than back in the entity's Documents tab.
    deletedAt = null,
  },
  transaction,
) {
  if (!source?.s3_key) return null;

  const newFileId = randomUUID();
  const slash = source.s3_key.lastIndexOf("/");
  const folder = slash >= 0 ? source.s3_key.slice(0, slash + 1) : "";
  const basename = slash >= 0 ? source.s3_key.slice(slash + 1) : source.s3_key;

  const copiedKey = await copyS3Object(source.s3_key, `${folder}${newFileId}-${basename}`);
  if (!copiedKey) return null;

  const created = await db.DriveFile.create(
    {
      file_id: newFileId,
      folder_id: folderId,
      company_id: companyId,
      builder_id: builderId,
      uploaded_by: uploadedBy,
      lead_id: leadId,
      reference_id: referenceId,
      reference_type: source.reference_type,
      sub_reference_id: null,
      sub_reference_type: source.sub_reference_type,
      original_name: source.original_name,
      file_name: await ensureUniqueDriveFileName(source.file_name, { transaction, companyId }),
      s3_key: copiedKey,
      file_extension: source.file_extension,
      mime_type: source.mime_type,
      size: source.size,
      is_starred: source.is_starred,
      sort_order: source.sort_order,
      // Regenerated on demand — copying the key would share the demo account's
      // thumbnail object, which is what this clone exists to avoid.
      thumbnail_s3_key: null,
      thumbnail_status: "pending",
      deleted_at: deletedAt,
      is_sample_data: true,
    },
    { transaction },
  );

  return created.file_id;
}

/**
 * Delete whatever an image column currently points at. Accepts the *raw* column
 * value: a DriveFile UUID (drops the DriveFile row + its S3 object) or a legacy
 * S3 key/URL (drops just the S3 object). No-op for empty values.
 */
export async function removeImageByRef(rawValue, transaction) {
  if (!rawValue) return;
  if (isUuid(rawValue)) {
    const file = await db.DriveFile.findOne({ where: { file_id: rawValue }, transaction });
    if (file) {
      await deleteFromS3(file.s3_key);
      await file.destroy({ transaction });
    }
  } else {
    await deleteFromS3(rawValue);
  }
}

/**
 * Read raw (unresolved) image column value(s) straight from the table, bypassing
 * the afterFind URL-resolution hook. Needed before replacing/deleting an image
 * because the hook would otherwise have rewritten the UUID into a full URL.
 *
 * @returns {Promise<object>} a plain row with the requested columns (or {}).
 */
export async function getRawImageColumns(tableName, pkColumn, pkValue, columns, transaction) {
  const cols = columns.map((c) => `"${c}"`).join(", ");
  const [[row]] = await db.sequelize.query(
    `SELECT ${cols} FROM "${tableName}" WHERE "${pkColumn}" = :pk`,
    { replacements: { pk: pkValue }, transaction },
  );
  return row || {};
}
