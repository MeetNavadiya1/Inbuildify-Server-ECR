import { v5 as uuidv5 } from "uuid";

/**
 * The Job/Lead "Documents" trees mix two kinds of folder:
 *   • real, user-created folders — persisted `drive` rows with a genuine
 *     `drive_id` UUID (writable: valid as a parentId / upload folderId), and
 *   • computed "buckets" (Colour Selection Reports, Quotation → …, Variations,
 *     the Documents root itself) that are grouped on the fly from files'
 *     sub_reference_type and are NOT persisted.
 *
 * The buckets used to expose synthetic string ids ("variations_root",
 * `qt_<uuid>`, …). To keep every `folderId` a valid UUID, this derives a STABLE
 * v5 UUID from (scopeId, key): the same entity + same bucket always yields the
 * same id across requests (a random v4 would change every call and break the
 * frontend's keys/navigation). These ids are still read-only groupings — folder
 * nodes also carry `isSystem: true` so callers never send them as a parent.
 */

// Fixed namespace — any valid UUID works; it just seeds the v5 hash.

const VIRTUAL_FOLDER_NAMESPACE = "a6c5f1e2-3b4d-4e5f-8a9b-0c1d2e3f4a5b";

export function virtualFolderId(scopeId, key) {
  return uuidv5(`${scopeId || "global"}:${key}`, VIRTUAL_FOLDER_NAMESPACE);
}

export default virtualFolderId;
