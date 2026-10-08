/**
 * Entity types whose stored documents can be re-named to the administrator's
 * file naming format (Admin → Document → File Naming) by the "Sync Names"
 * button — see modules/drive/drive-name-sync.service.js.
 *
 * Kept apart from that service so request validation can name the scopes
 * without pulling the lead/job service graph in with it. The service asserts at
 * load time that it implements every scope listed here, so the two cannot drift.
 */
export const DOCUMENT_SYNC_SCOPES = Object.freeze({
  LEAD: "lead",
  JOB: "job",
  // Not an entity that owns files itself — it fans out over every lead and job
  // the user is attached to. See the fanOut entry in drive-name-sync.service.js.
  USER: "user",
});

export const DOCUMENT_SYNC_SCOPE_NAMES = Object.freeze(Object.values(DOCUMENT_SYNC_SCOPES));

export default { DOCUMENT_SYNC_SCOPES, DOCUMENT_SYNC_SCOPE_NAMES };
