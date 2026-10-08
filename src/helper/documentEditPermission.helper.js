import db from "../config/database/models/postgre-models/index.js";
import {
  isDocumentEditingAllowed,
  documentEditBlockedBy,
  describeDocumentType,
} from "../utils/documentEdit.js";

/**
 * Server-side enforcement of the administrator's editing rules.
 *
 * There are two, and they answer the same question at different grains:
 *
 *   - **Per type** — Admin → General → Editable PDF Configuration. "Nobody
 *     edits a building contract" is a rule about the type, and setting it per
 *     file would mean hunting down every contract and missing every one issued
 *     afterwards.
 *   - **Per file** — Admin → Document → Document Management. The exception:
 *     lock this one document, or release this one from a blocked type.
 *
 * The per-file switch wins over the type rule in both directions, because a rule
 * with no exception is one people work around by turning it off entirely.
 *
 * Both were decoration on list responses until this module existed; nothing
 * stopped a client posting a new version of a locked file straight to the API.
 * Read-only has to mean read-only at the endpoint or it means nothing, so every
 * path that replaces a stored file's content runs through
 * `assertDocumentEditable` before it touches S3 or the database.
 */

/**
 * The company's editing settings, in one query.
 *
 * Both lists come from the same row, and the callers that stamp `editing_allowed`
 * on a listing need both — fetching them separately would double the query count
 * of every drive listing in the application.
 *
 * @returns {Promise<{ editablePdfTypes: string[], blockedTypes: string[] }>}
 */
export const getDocumentEditPolicy = async (companyId) => {
  if (!companyId) return { editablePdfTypes: [], blockedTypes: [] };

  const settings = await db.sequelize.models.GeneralSettings.findOne({
    where: { company_id: companyId },
    attributes: ["editable_pdf_types", "non_editable_document_types"],
  });

  return {
    editablePdfTypes: settings?.editable_pdf_types || [],
    // A blocklist: absent means editable. An empty one is what every tenant has
    // until an administrator turns something off.
    blockedTypes: settings?.non_editable_document_types || [],
  };
};

/** The company's record-editable PDF types, or [] when it has no settings row. */
export const getEditablePdfTypes = async (companyId) => {
  const { editablePdfTypes } = await getDocumentEditPolicy(companyId);
  return editablePdfTypes;
};

/** The document types nobody may edit, or [] when nothing is turned off. */
export const getBlockedDocumentTypes = async (companyId) => {
  const { blockedTypes } = await getDocumentEditPolicy(companyId);
  return blockedTypes;
};

/**
 * Throw a 403 unless `file` may be edited.
 *
 * Takes an already-loaded DriveFile so callers that have fetched (and
 * tenant-checked) the row do not fetch it twice. `blockedTypes` is passed in
 * where the caller already has the policy; otherwise it is looked up, which is
 * one query on a write path that is about to do far more work than that.
 *
 * Deliberately applies to every stored file, not only the formats Document
 * Management lists: the switch is the authority on whether a file's bytes may be
 * replaced, and exempting unusual extensions would leave a way around it.
 *
 * The message names the screen that can lift the restriction, and the two
 * restrictions live on different screens — sending an administrator to the wrong
 * one turns a five-second fix into a support ticket.
 *
 * The thrown error carries `statusCode: 403`, which `handleControllerError`
 * forwards intact, so the client is told it was refused rather than that the
 * server broke.
 */
export const assertDocumentEditable = async (file, blockedTypes) => {
  const blocked =
    blockedTypes === undefined ? await getBlockedDocumentTypes(file?.company_id) : blockedTypes;

  if (isDocumentEditingAllowed(file, blocked)) return;

  const type = describeDocumentType(file);
  const reason = documentEditBlockedBy(file, blocked);
  const where =
    reason === "type"
      ? "An administrator can enable it under Admin → General → Editable PDF Configuration."
      : "An administrator can enable it under Admin → Document → Document Management.";

  const error = new Error(
    reason === "type"
      ? `Editing is turned off for every document of this type. ${where}`
      : `Editing is turned off for this ${type?.label || "document"}. ${where}`,
  );
  error.statusCode = 403;
  error.code = "DOCUMENT_EDIT_DISABLED";
  error.details = {
    file_id: file?.file_id ?? null,
    format: type?.format ?? null,
    // Which of the two rules refused it, so a client can point at the right
    // screen without parsing the sentence above.
    blocked_by: reason,
  };
  throw error;
};

export default {
  assertDocumentEditable,
  getDocumentEditPolicy,
  getEditablePdfTypes,
  getBlockedDocumentTypes,
};
