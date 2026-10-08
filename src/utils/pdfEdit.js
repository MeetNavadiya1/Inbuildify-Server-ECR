import {
  isDocumentEditingAllowed,
  getDocumentTypeKey,
  GENERATED_TYPE_KEYS,
} from "./documentEdit.js";

/**
 * The document's reference type key.
 *
 * Moved to `documentEdit.js`, where the per-type editing rule needs it — that
 * module cannot import this one back without a cycle. Re-exported here under its
 * original name so every existing caller is unaffected.
 */
export { getDocumentTypeKey as getPDFTypeKey, GENERATED_TYPE_KEYS };

/**
 * Checks if a file is a PDF based on extension or mime type.
 * 
 * @param {Object} file - The file object/metadata
 * @returns {boolean}
 */
export function isPdfFile(file) {
  if (!file) return false;
  const ext = file.file_extension || (file.original_name ? file.original_name.substring(file.original_name.lastIndexOf(".")) : "");
  const mime = file.mime_type;
  return (ext && ext.toLowerCase() === ".pdf") || (mime && mime.toLowerCase() === "application/pdf");
}

/**
 * Did the application generate this document, or did somebody upload it?
 *
 * Decided by the polymorphic reference its generator stamped on the row, which
 * has nothing to do with the file format — a generated document is a generated
 * document whether it was rendered as a PDF or written as a workbook. Document
 * Management shows this as the Source column for every format it lists.
 *
 * @param {Object} file - The file object/metadata
 * @returns {"generated"|"uploaded"}
 */
export function getDocumentSourceTag(file) {
  return GENERATED_TYPE_KEYS.has(getDocumentTypeKey(file)) ? "generated" : "uploaded";
}

/**
 * Returns "generated", "uploaded", or null for the file.
 *
 * PDF-only, because its callers decorate a PDF-specific field. Use
 * `getDocumentSourceTag` for anything that has to answer for every format.
 *
 * @param {Object} file - The file object/metadata
 * @returns {string|null}
 */
export function getPdfTypeTag(file) {
  if (!isPdfFile(file)) return null;
  return getDocumentSourceTag(file);
}

/**
 * Determines whether a file offers the *edit-the-record* form.
 *
 * A generated PDF is a rendering of a record, so "editing" it that way means
 * changing the record and re-issuing the document. Only types with a registered
 * editor and a tick under Admin → General → Editable PDF Configuration offer it,
 * which is what `editablePdfTypes` carries.
 *
 * That is a narrower question than "may this be edited at all" — which is the
 * administrator's per-file switch, `isDocumentEditingAllowed` in documentEdit.js,
 * and applies to workbooks and Word documents as well. An uploaded site report
 * has no record to re-issue and is never in the whitelist, yet it edits
 * perfectly well in the document editor. Keeping the two apart is what stops a
 * document-type setting being mistaken for a permission.
 *
 * The admin switch still overrules this: a file locked in Document Management
 * offers nothing, record form included.
 *
 * @param {Object} file - The file metadata/object
 * @param {Array<string>} editablePdfTypes - The whitelisted PDF keys from GeneralSettings
 * @returns {boolean}
 */
export function isPdfEditable(file, editablePdfTypes = [], blockedTypes = []) {
  if (!isPdfFile(file)) {
    return true; // Non-PDFs are editable by default
  }

  // Editing turned off — for this file, or for its whole type — takes everything
  // with it, the record form included. Offering "edit through the record" on a
  // document nobody may change would be a way straight around the rule.
  if (!isDocumentEditingAllowed(file, blockedTypes)) return false;

  const key = getDocumentTypeKey(file);
  const whitelist = Array.isArray(editablePdfTypes) ? editablePdfTypes : [];
  return whitelist.includes(key);
}
