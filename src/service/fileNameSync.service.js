import db from "../config/database/models/postgre-models/index.js";
import {
  generateFileName,
  ensureUniqueDriveFileName,
  extensionOf,
  normalizeExtension,
  resolveFileTypeLabel,
  fileTypeForStorageKey,
} from "./fileNaming.service.js";
import { FILE_TYPE_BY_SUB_REFERENCE } from "../constants/fileNaming.js";

/**
 * FileNameSyncService — re-applies the administrator-configured naming format
 * (Admin → Document → File Naming) to documents that are *already* stored.
 *
 * `fileNaming.service` names a file once, at upload time. Change the format
 * afterwards and every existing document keeps the name it was born with, so a
 * lead's Documents tab ends up a mix of old and new conventions. The "Sync
 * Names" button calls in here to bring the whole set back in line.
 *
 * Scope of the rename: `drive_files.file_name` only.
 *   - It is the name the UI shows (see documentDisplayName in FileExplorer) and
 *     the name a download is saved under, so this is what users actually mean by
 *     "the file name".
 *   - `s3_key` is deliberately left alone: S3 has no rename, only copy+delete,
 *     which would break every URL already handed out (emails, signed quotes,
 *     PDFs that embed the link) for a name nobody ever sees in the URL bar.
 *   - `original_name` is left alone too — it records what the user uploaded.
 */

/** The `[FileType]` token for a stored file, best source first. */
export function fileTypeForDriveFile(file) {
  return (
    FILE_TYPE_BY_SUB_REFERENCE[file.sub_reference_type] ||
    fileTypeForStorageKey(file.s3_key) ||
    resolveFileTypeLabel({ mimeType: file.mime_type, originalName: file.original_name || file.file_name })
  );
}

/** The extension to keep — the stored one wins, then the current/original name. */
const extensionForDriveFile = (file) =>
  normalizeExtension(file.file_extension) ||
  extensionOf(file.file_name) ||
  extensionOf(file.original_name);

/** The name `format` asks for, before any collision handling. */
function desiredNameFor(file, format, namingData) {
  return generateFileName(
    format,
    {
      ...namingData,
      // Per-file tokens: the document's own age and its own type. Using "today"
      // would stamp every historical document with the sync date.
      createdDate: file.created_at || namingData.createdDate,
      fileType: fileTypeForDriveFile(file),
    },
    extensionForDriveFile(file),
  );
}

/**
 * Work out the new name for every file, without touching the database.
 *
 * Collisions are resolved across the whole batch at once, which needs the files
 * split into two groups *before* any name is assigned:
 *
 *   - Files already matching the format keep their name. That name is never
 *     released, so it is claimed up front and their row still counts as a
 *     collision in the database.
 *   - Only the files that actually move release their current name, so only
 *     their ids are excluded from the collision check.
 *
 * Doing this in one pass was wrong: a file whose desired name was already held
 * by a later, already-correct file was handed that name anyway, and the write
 * failed with `drive_files_file_name_key`.
 *
 * @returns {Promise<Array<{ file, from: string, to: string, changed: boolean }>>}
 *          in the order the files were given.
 */
export async function planFileNameSync({ files, format, namingData, transaction = null }) {
  // Pass 1 — render every desired name and split by whether it moves the file.
  const settled = new Map(); // file_id -> plan entry, filled in either pass
  const moving = [];
  const claimed = new Set();

  for (const file of files) {
    const desired = desiredNameFor(file, format, namingData);
    if (desired === file.file_name) {
      claimed.add(desired);
      settled.set(file.file_id, { file, from: file.file_name, to: file.file_name, changed: false });
    } else {
      moving.push({ file, desired });
    }
  }

  // Pass 2 — assign the movers, avoiding names held by the stayers, by earlier
  // movers, and by any row outside this batch (including soft-deleted ones,
  // which still occupy the unique index).
  const releasedIds = moving.map(({ file }) => file.file_id);

  for (const { file, desired } of moving) {
    // eslint-disable-next-line no-await-in-loop
    const unique = await ensureUniqueDriveFileName(desired, {
      transaction,
      existingNames: claimed,
      excludeFileIds: releasedIds,
    });
    claimed.add(unique);
    // The suffix search can land back on this file's own current name, which is
    // the ideal outcome — nothing to write.
    settled.set(file.file_id, { file, from: file.file_name, to: unique, changed: unique !== file.file_name });
  }

  return files.map((file) => settled.get(file.file_id));
}

/**
 * Guard the plan before it reaches Postgres: no two files may end up with the
 * same name. `drive_files.file_name` is UNIQUE, so a planner slip would surface
 * as a mid-write constraint violation that says nothing about which files
 * clashed — this fails first, and names them.
 */
function assertPlanIsCollisionFree(plan) {
  const byName = new Map();
  for (const entry of plan) {
    const clash = byName.get(entry.to);
    if (clash) {
      throw new Error(
        `File name sync would give two documents the same name "${entry.to}" ` +
        `("${clash.from}" and "${entry.from}"). No files were changed.`,
      );
    }
    byName.set(entry.to, entry);
  }
}

/**
 * Re-name every file in `files` to match `format`.
 *
 * The writes run in two passes inside one transaction. `file_name` is UNIQUE, so
 * assigning file B the name file A still holds would violate the constraint even
 * though A is renamed moments later; parking each row on a throwaway name first
 * removes the ordering problem entirely.
 *
 * @param {object}   params
 * @param {object[]} params.files       DriveFile instances to re-name
 * @param {string}   params.format      the configured naming format
 * @param {object}   params.namingData  { fullName, address, referenceNumber }
 * @param {string}   [params.companyId] for the activity log
 * @param {string}   [params.userId]    for the activity log
 * @returns {Promise<{ total: number, renamed: number, unchanged: number,
 *                     files: Array<{ fileId: string, from: string, to: string }> }>}
 */
export async function syncDriveFileNames({ files = [], format, namingData = {}, companyId = null, userId = null }) {
  if (!files.length) return { total: 0, renamed: 0, unchanged: 0, files: [] };

  const { DriveFile, DriveActivityLog } = db.sequelize.models;
  const transaction = await db.sequelize.transaction();

  let applied = [];
  try {
    const plan = await planFileNameSync({ files, format, namingData, transaction });
    assertPlanIsCollisionFree(plan);
    applied = plan.filter((entry) => entry.changed);

    // Pass 1 — park every changing row on a name nothing else can hold.
    for (const { file } of applied) {
      // eslint-disable-next-line no-await-in-loop
      await DriveFile.update(
        { file_name: `.syncing-${file.file_id}` },
        { where: { file_id: file.file_id }, transaction },
      );
    }

    // Pass 2 — settle on the configured names.
    for (const { file, to } of applied) {
      // eslint-disable-next-line no-await-in-loop
      await DriveFile.update(
        { file_name: to },
        { where: { file_id: file.file_id }, transaction },
      );
      // Keep the caller's already-loaded instance in step with the row.
      file.setDataValue?.("file_name", to);
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();

    // A file uploaded into this entity while the sync was running can take a
    // name the plan had already reserved. Nothing was written, so say what
    // happened instead of surfacing a raw constraint dump.
    if (error?.name === "SequelizeUniqueConstraintError") {
      const taken = error.fields?.file_name || error.errors?.[0]?.value;
      const conflict = new Error(
        `Could not rename the documents because the name "${taken}" was taken while the sync ran. ` +
        "No files were changed — please try again.",
      );
      conflict.statusCode = 409; // retryable, not a server fault
      throw conflict;
    }
    throw error;
  }

  if (DriveActivityLog && companyId && applied.length) {
    await DriveActivityLog.bulkCreate(
      applied.map(({ file, from, to }) => ({
        company_id: companyId,
        user_id: userId,
        action: "RENAME",
        entity_type: "FILE",
        entity_id: file.file_id,
        entity_name: to,
        details: `Synced file name from "${from}" to "${to}"`,
      })),
    ).catch((e) => console.error("Error logging activity", e));
  }

  return {
    total: files.length,
    renamed: applied.length,
    unchanged: files.length - applied.length,
    files: applied.map(({ file, from, to }) => ({ fileId: file.file_id, from, to })),
  };
}

export default { fileTypeForDriveFile, planFileNameSync, syncDriveFileNames };
