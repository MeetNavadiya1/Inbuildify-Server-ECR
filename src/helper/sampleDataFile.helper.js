import { randomUUID } from "crypto";

import { env } from "../config/env.config.js";
import { copyS3Object } from "../utils/s3Upload.js";

/**
 * S3 helpers for the file columns that are NOT backed by a DriveFile row.
 *
 * Two kinds of file column exist in this schema. The DriveFile-backed ones
 * (facade.image, floor_plan.detailed_image, job.color_report, …) store a
 * drive_files PK and are cloned by imageDriveFile.helper.js. The columns here
 * store the S3 location directly as text — no drive_files row at all.
 *
 * Copying those verbatim into sample data made the seeded record point at the
 * demo account's object. That reads fine, but the modules that own these
 * columns delete the object when the row is deleted or its file replaced
 * (supplier.service deletes on supplier delete, estate.service on logo replace,
 * maintenance.service on request delete). A builder clearing their sample data
 * would therefore have deleted the demo account's file, breaking it for the
 * demo account and for every future import. So each one gets its own copy.
 */

/**
 * Which text columns on which model hold an S3 location.
 *
 * - `text`    a single URL or key
 * - `list`    a TEXT[] of them
 * - `entries` a JSONB array of uploader entries — `{ url }` in the common case,
 *             but rows copied between the template and job colour tables have
 *             been seen carrying the location under other keys, or as a bare
 *             string (see imageEntryLocation below)
 */
export const SAMPLE_FILE_COLUMNS = {
  Supplier: {
    text: [
      "work_cover_url", "pl_insurance_url", "white_card_url",
      "fork_lift_license_url", "trade_license_url", "induction_pack_url",
    ],
  },
  SupplierDocuments: {
    text: [
      "work_cover_url", "pl_insurance_url", "white_card_url",
      "fork_lift_license_url", "trade_license_url", "induction_pack_url",
    ],
  },
  Estate: { text: ["estate_logo"] },
  Users: { text: ["photo", "signature"] },
  Range: { text: ["logo_url", "header_url"] },
  QuotationFormat: { text: ["watermark", "default_facade", "draft_background_image"] },
  EstateStages: { list: ["attach_file"] },
  EstateDocuments: { text: ["file_url"] },
  EstateImages: { text: ["image_url"] },
  ContractSection: { text: ["section_url"] },
  WorkflowProcessTask: { text: ["attachment"] },
  Task: { text: ["attach_files"] },
  Actions: { text: ["attach_file"] },
  Notes: { text: ["attach_file"] },
  MaintenanceRequest: { text: ["attach_file"] },
  QuotationVersionCustomSection: { text: ["file_url"] },
  ColorItem: { entries: ["color_image", "specification"] },
  JobColorItem: { entries: ["color_image", "specification"] },
};

/**
 * Every file-bearing column on a model, flat. The purge needs these in its
 * `attributes` list — it selects a narrow set of columns, and a column it did
 * not select cannot have its S3 object collected.
 *
 * @returns {string[]} empty for a model with no file columns
 */
export function fileColumnsFor(modelName) {
  const spec = SAMPLE_FILE_COLUMNS[modelName];
  if (!spec) return [];
  return [...(spec.text || []), ...(spec.list || []), ...(spec.entries || [])];
}

/**
 * The S3 key a stored value points at. Mirrors deleteFromS3's parsing so a value
 * this module copies is one deleteFromS3 can later remove.
 */
function s3KeyOf(value) {
  if (!value || typeof value !== "string") return null;
  if (!value.startsWith("http")) return value;

  try {
    const bucketName = env.AWS.S3_BUCKET_NAME;
    let key = decodeURIComponent(new URL(value).pathname.substring(1));
    if (key.startsWith(`${bucketName}/`)) key = key.substring(bucketName.length + 1);
    return key || null;
  } catch {
    return value;
  }
}

/** Read the location out of a JSONB uploader entry, whatever key it landed under. */
function imageEntryLocation(entry) {
  if (!entry) return null;
  if (typeof entry === "string") return entry.trim() || null;

  for (const key of ["url", "fileUrl", "imageUrl", "location", "src"]) {
    const candidate = entry[key];
    if (typeof candidate === "string" && candidate.trim()) return key;
  }
  return null;
}

/**
 * Copy the object a value points at and return a value of the same shape — a
 * URL in gives a URL back, a bare key gives a key back — so the column keeps
 * whatever format that module writes.
 *
 * @returns {Promise<string|null>} null when there is nothing to copy or the
 *   copy failed; callers leave the column empty rather than re-share the source.
 */
async function cloneS3Value(value) {
  const sourceKey = s3KeyOf(value);
  if (!sourceKey) return null;

  const slash = sourceKey.lastIndexOf("/");
  const folder = slash >= 0 ? sourceKey.slice(0, slash + 1) : "";
  const basename = slash >= 0 ? sourceKey.slice(slash + 1) : sourceKey;
  const copiedKey = await copyS3Object(sourceKey, `${folder}${randomUUID()}-${basename}`);
  if (!copiedKey) return null;

  // Preserve the caller's format: swap the key inside the original URL.
  return value.startsWith("http") ? value.replace(sourceKey, copiedKey) : copiedKey;
}

/**
 * Build the column overrides that give a cloned row its own copy of every file
 * the source row referenced.
 *
 * @param {object} row       the source row, plain
 * @param {string} modelName key into SAMPLE_FILE_COLUMNS; unknown models yield {}
 * @returns {Promise<object>} spread this over the clone payload
 */
export async function cloneFileColumns(row, modelName) {
  const spec = SAMPLE_FILE_COLUMNS[modelName];
  if (!spec || !row) return {};

  const overrides = {};

  for (const column of spec.text || []) {
    if (row[column]) overrides[column] = await cloneS3Value(row[column]);
  }

  for (const column of spec.list || []) {
    if (!Array.isArray(row[column]) || row[column].length === 0) continue;
    const copies = [];
    for (const value of row[column]) {
      const copied = await cloneS3Value(value);
      if (copied) copies.push(copied);
    }
    overrides[column] = copies;
  }

  for (const column of spec.entries || []) {
    const entries = parseEntries(row[column]);
    if (entries.length === 0) continue;

    const copies = [];
    for (const entry of entries) {
      if (typeof entry === "string") {
        const copied = await cloneS3Value(entry);
        if (copied) copies.push(copied);
        continue;
      }
      const locationKey = imageEntryLocation(entry);
      if (!locationKey) {
        // No file to copy — a caption-only entry, say. Keep it as it is.
        copies.push(entry);
        continue;
      }
      const copied = await cloneS3Value(entry[locationKey]);
      if (copied) copies.push({ ...entry, [locationKey]: copied });
    }
    overrides[column] = copies;
  }

  return overrides;
}

/** The JSONB column is usually an array but has been seen stringified. */
function parseEntries(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Every S3 location a set of rows references, for the purge to delete once its
 * transaction commits. Values are returned as stored — deleteFromS3 accepts
 * both a URL and a bare key.
 *
 * @param {object[]} rows      rows about to be deleted (Sequelize instances or plain)
 * @param {string} modelName   key into SAMPLE_FILE_COLUMNS
 * @returns {string[]}
 */
export function collectFileValues(rows, modelName) {
  const spec = SAMPLE_FILE_COLUMNS[modelName];
  if (!spec || !rows?.length) return [];

  const values = [];
  for (const row of rows) {
    const plain = row?.get ? row.get({ plain: true }) : row;
    if (!plain) continue;

    for (const column of spec.text || []) {
      if (plain[column]) values.push(plain[column]);
    }
    for (const column of spec.list || []) {
      if (Array.isArray(plain[column])) values.push(...plain[column].filter(Boolean));
    }
    for (const column of spec.entries || []) {
      for (const entry of parseEntries(plain[column])) {
        if (typeof entry === "string") {
          if (entry.trim()) values.push(entry);
          continue;
        }
        const locationKey = imageEntryLocation(entry);
        if (locationKey) values.push(entry[locationKey]);
      }
    }
  }

  return values;
}
