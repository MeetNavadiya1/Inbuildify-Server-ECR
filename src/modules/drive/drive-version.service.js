/**
 * Drive File Version Service (Stage C1)
 *
 * Strategy:
 * - Latest file is always the live row in `drive_files`.
 * - When uploading a new version, the CURRENT live data is first snapshotted
 *   into `drive_file_versions`, then `drive_files` is updated with the new content.
 * - Version numbers are sequential per file (1, 2, 3...).
 * - Version retention: configurable MAX_VERSIONS; oldest version is pruned + its S3
 *   object deleted when limit is exceeded.
 */

import { v4 as uuidv4 } from "uuid";
import db from "../../config/database/models/postgre-models/index.js";
import {
  uploadFile,
  deleteObject,
  generatePresignedDownloadUrl,
  getObject,
} from "../../service/s3.service.js";
import { buildFileName, ensureUniqueDriveFileName } from "../../service/fileNaming.service.js";
import { assertDocumentEditable } from "../../helper/documentEditPermission.helper.js";
import { extensionOf } from "../../utils/documentEdit.js";
import {
  convertLegacyDocument,
  isConvertibleLegacy,
} from "../../service/officeConvert.service.js";
import { DRIVE_ACTIONS, recordDriveActivity } from "../../helper/driveActivity.helper.js";

const MAX_VERSIONS = 10; // Retain at most 10 historical versions per file

/**
 * A byte count as the audit history shows it.
 *
 * "7.8 KB → 8.1 KB" says a paragraph changed; "7.8 KB → 340 KB" says the
 * document was replaced. Raw byte counts make the reader do that arithmetic.
 */
const formatSize = (bytes) => {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return null;
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

/**
 * Upload a new version of an existing file.
 * Current live content → archived in versions table.
 * New content → replaces drive_files row.
 */
export const uploadNewVersionService = async (fileId, file, companyId, userId) => {
  const { DriveFile, DriveFileVersion, DriveActivityLog } = db.sequelize.models;

  const existingFile = await DriveFile.findOne({
    where: { file_id: fileId, company_id: companyId },
  });

  if (!existingFile) throw new Error("File not found.");

  // Two separate questions, both of which have to be yes.
  //
  // *May this user write here?* is the route's `canEdit` — access to the file.
  //
  // *May this document be changed at all?* is this check: the administrator's
  // switch for this one document, from Admin → Document → Document Management.
  //
  // This service did once refuse a PDF whose *type* was not ticked under Admin →
  // General → Editable PDF Configuration, and that check was rightly removed —
  // it condemned a whole document type, so a user could edit a PDF in the
  // browser and only be told at save time that the work was not allowed. The
  // per-file switch is what makes it precise: it is off only where an
  // administrator turned it off, the client greys the editor out for exactly
  // those files, and this is the backstop for a request that skipped the UI.
  await assertDocumentEditable(existingFile);

  // Captured before the row is overwritten — this is what the audit history
  // shows as the "before" for a content update.
  const previousSize = existingFile.size;

  const transaction = await db.sequelize.transaction();
  try {
    // 1. Find the current highest version number for this file
    const latestVersion = await DriveFileVersion.findOne({
      where: { file_id: fileId },
      order: [["version_number", "DESC"]],
      transaction,
    });
    const nextVersionNumber = (latestVersion?.version_number ?? 0) + 1;

    // 2. Archive the current live file data as the next historical version
    await DriveFileVersion.create({
      file_id: fileId,
      company_id: companyId,
      version_number: nextVersionNumber,
      s3_key: existingFile.s3_key,
      file_name: existingFile.file_name,
      size: existingFile.size,
      mime_type: existingFile.mime_type,
      uploaded_by: existingFile.uploaded_by,
    }, { transaction });

    // 3. Upload the new file to S3 under the administrator-configured name
    const ext = file.originalname.substring(file.originalname.lastIndexOf("."));
    const namedFile = await buildFileName({
      companyId,
      builderId: existingFile.builder_id,
      leadId: existingFile.lead_id,
      originalName: file.originalname,
      mimeType: file.mimetype,
      extension: ext,
    });
    const uniqueFileName = await ensureUniqueDriveFileName(namedFile, { transaction });
    const newS3Key = `drive/${companyId}/${uuidv4()}/${uniqueFileName}`;

    const uploadResult = await uploadFile(newS3Key, file.buffer, file.mimetype);
    if (!uploadResult.success) throw new Error("Failed to upload new version to S3.");

    // 4. Update the live drive_files row with the new data
    await existingFile.update({
      s3_key: newS3Key,
      file_name: uniqueFileName,
      file_extension: ext,
      mime_type: file.mimetype,
      size: file.size,
      uploaded_by: userId,
      // Reset thumbnail for regeneration on next access
      thumbnail_s3_key: null,
      thumbnail_status: 'pending',
    }, { transaction });

    await transaction.commit();

    // 5. Enforce version retention: prune oldest versions beyond MAX_VERSIONS
    setImmediate(async () => {
      try {
        const allVersions = await DriveFileVersion.findAll({
          where: { file_id: fileId },
          order: [["version_number", "ASC"]],
          attributes: ["version_id", "s3_key"],
        });
        if (allVersions.length > MAX_VERSIONS) {
          const toDelete = allVersions.slice(0, allVersions.length - MAX_VERSIONS);
          const s3Keys = toDelete.map((v) => v.s3_key);
          // Delete from S3
          for (const key of s3Keys) {
            await deleteObject(key).catch((e) => console.error("[VersionPurge] S3 delete failed:", e));
          }
          // Delete from DB
          const ids = toDelete.map((v) => v.version_id);
          await DriveFileVersion.destroy({ where: { version_id: ids } });
          console.log(`[VersionPurge] Pruned ${toDelete.length} old versions for file ${fileId}`);
        }
      } catch (err) {
        console.error("[VersionPurge] Error during retention enforcement:", err);
      }
    });

    // 6. Log activity. Size is the only thing about a document's *content* that
    // can be shown as a before-and-after without opening it, and it is enough to
    // tell a small correction from a wholesale replacement.
    await recordDriveActivity({
      companyId,
      actor: userId,
      action: DRIVE_ACTIONS.NEW_VERSION,
      entityId: fileId,
      entityName: existingFile.original_name,
      details: `Saved as version ${nextVersionNumber + 1}. The previous copy is kept in this document's version history.`,
      oldValue: formatSize(previousSize),
      newValue: formatSize(file.size),
    });

    return {
      file_id: fileId,
      current_version: nextVersionNumber + 1,
      s3_key: newS3Key,
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

/**
 * Convert a pre-2007 `.doc` / `.xls` in place so it can be edited.
 *
 * Saved as a new version rather than a replacement: the original binary stays in
 * the version history and can be restored, so converting is never a one-way door
 * — which is what makes it safe to offer from the editor at all.
 *
 * The original name is kept, only its extension changes, because the file is
 * still the same document and is usually referenced by name.
 */
export const convertLegacyDocumentService = async (fileId, companyId, userId) => {
  const { DriveFile } = db.sequelize.models;

  const file = await DriveFile.findOne({ where: { file_id: fileId, company_id: companyId } });
  if (!file) {
    const error = new Error("File not found.");
    error.statusCode = 404;
    throw error;
  }

  // Converting rewrites the document, so it is a write and answers to the
  // administrator's switch like any other.
  await assertDocumentEditable(file);

  const plain = file.get({ plain: true });
  const extension = extensionOf(plain);

  if (!isConvertibleLegacy(extension)) {
    const error = new Error("Only .doc, .xls and .rtf documents need converting.");
    error.statusCode = 400;
    throw error;
  }

  const object = await getObject(file.s3_key);
  if (!object.success) {
    throw new Error("The document could not be read from storage.");
  }

  // A file named .doc that is really OOXML opens in the editor as it stands —
  // converting it would rewrite a document that was never the problem.
  if (object.data.length >= 4 && object.data.subarray(0, 4).toString("hex") === "504b0304") {
    const error = new Error("This document is already in a modern format and can be edited as it is.");
    error.statusCode = 409;
    error.code = "ALREADY_MODERN";
    throw error;
  }

  const converted = await convertLegacyDocument(object.data, extension);

  const originalName = plain.original_name || plain.file_name || `document.${extension}`;
  const dot = originalName.lastIndexOf(".");
  const baseName = dot === -1 ? originalName : originalName.slice(0, dot);

  const convertedName = `${baseName}.${converted.extension}`;

  const result = await uploadNewVersionService(
    fileId,
    {
      originalname: convertedName,
      buffer: converted.buffer,
      mimetype: converted.mimeType,
      size: converted.buffer.length,
    },
    companyId,
    userId,
  );

  // `uploadNewVersionService` deliberately leaves `original_name` alone: a new
  // version of a document is still that document, whatever the uploader happened
  // to call the file. A conversion is the one case where that is wrong — the
  // stored bytes really are a .docx now, and every listing reads its name from
  // this column. Left as it was, the drive would go on showing "Report.doc",
  // Document Management would go on calling it Word 97-2003, a download would
  // hand out a .doc containing OOXML, and the editor would offer to convert an
  // already-converted file.
  await file.update({ original_name: convertedName });

  // A conversion rewrites the document *and* renames it, and the version entry
  // above only says "content updated" — which is true and unhelpful. This is the
  // entry that explains why the file in the drive is suddenly a .docx.
  await recordDriveActivity({
    companyId,
    actor: userId,
    action: DRIVE_ACTIONS.CONVERT,
    entityId: fileId,
    entityName: convertedName,
    details: `Converted from the pre-2007 ${extension.toUpperCase()} format so it can be edited in the app. The original is kept in this document's version history.`,
    oldValue: originalName,
    newValue: convertedName,
  });

  return {
    ...result,
    converted_from: extension,
    converted_to: converted.extension,
    file_name: convertedName,
    mime_type: converted.mimeType,
  };
};

/**
 * List all historical versions for a file (NOT including the current live version).
 */
export const getFileVersionsService = async (fileId, companyId) => {
  const { DriveFile, DriveFileVersion } = db.sequelize.models;

  const file = await DriveFile.findOne({ where: { file_id: fileId, company_id: companyId } });
  if (!file) throw new Error("File not found.");

  const versions = await DriveFileVersion.findAll({
    where: { file_id: fileId, company_id: companyId },
    order: [["version_number", "DESC"]],
  });

  return {
    file_id: fileId,
    current: {
      s3_key: file.s3_key,
      size: file.size,
      mime_type: file.mime_type,
      uploaded_by: file.uploaded_by,
      updated_at: file.updated_at,
    },
    versions: versions.map((v) => ({
      version_id: v.version_id,
      version_number: v.version_number,
      s3_key: v.s3_key,
      size: v.size,
      mime_type: v.mime_type,
      uploaded_by: v.uploaded_by,
      created_at: v.created_at,
    })),
  };
};

/**
 * Generate a private signed download URL for a specific historical version.
 */
export const getVersionDownloadUrlService = async (fileId, versionId, companyId) => {
  const { DriveFileVersion } = db.sequelize.models;

  const version = await DriveFileVersion.findOne({
    where: { version_id: versionId, file_id: fileId, company_id: companyId },
  });
  if (!version) throw new Error("Version not found.");

  const result = await generatePresignedDownloadUrl(version.s3_key);
  if (!result.success) throw new Error("Failed to generate download URL.");

  return result.url;
};

/**
 * Restore a historical version as the current live file.
 * This creates a new version entry from the current state before reverting.
 */
export const restoreVersionService = async (fileId, versionId, companyId, userId) => {
  const { DriveFile, DriveFileVersion, DriveActivityLog } = db.sequelize.models;

  const file = await DriveFile.findOne({ where: { file_id: fileId, company_id: companyId } });
  if (!file) throw new Error("File not found.");

  const version = await DriveFileVersion.findOne({
    where: { version_id: versionId, file_id: fileId, company_id: companyId },
  });
  if (!version) throw new Error("Version not found.");

  // Rolling the live file back to an older version replaces its content, so it
  // is an edit and answers to the same rule as uploading one.
  await assertDocumentEditable(file);

  const transaction = await db.sequelize.transaction();
  try {
    // Archive current as a new version
    const latestVersion = await DriveFileVersion.findOne({
      where: { file_id: fileId },
      order: [["version_number", "DESC"]],
      transaction,
    });
    const nextVersionNumber = (latestVersion?.version_number ?? 0) + 1;

    await DriveFileVersion.create({
      file_id: fileId,
      company_id: companyId,
      version_number: nextVersionNumber,
      s3_key: file.s3_key,
      file_name: file.file_name,
      size: file.size,
      mime_type: file.mime_type,
      uploaded_by: file.uploaded_by,
    }, { transaction });

    // Restore the target version to live
    await file.update({
      s3_key: version.s3_key,
      file_name: version.file_name,
      mime_type: version.mime_type,
      size: version.size,
      uploaded_by: userId,
      thumbnail_s3_key: null,
      thumbnail_status: 'pending',
    }, { transaction });

    await transaction.commit();

    if (DriveActivityLog) {
      await DriveActivityLog.create({
        company_id: companyId,
        user_id: userId,
        action: "RESTORE_VERSION",
        entity_type: "FILE",
        entity_id: fileId,
        entity_name: file.original_name,
        details: `Restored to version ${version.version_number}`,
      }).catch((e) => console.error("[ActivityLog] Error:", e));
    }

    return { file_id: fileId, restored_version: version.version_number };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
};

/**
 * Delete a specific historical version (hard delete from DB + S3).
 */
export const deleteVersionService = async (fileId, versionId, companyId, userId) => {
  const { DriveFileVersion } = db.sequelize.models;

  const version = await DriveFileVersion.findOne({
    where: { version_id: versionId, file_id: fileId, company_id: companyId },
  });
  if (!version) throw new Error("Version not found.");

  await deleteObject(version.s3_key);
  await version.destroy();
};
