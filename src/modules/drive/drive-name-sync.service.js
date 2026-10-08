import leadsService from "../lead/leads.service.js";
import jobService from "../job/job.service.js";
import { getNamingFormat, resolveNamingData } from "../../service/fileNaming.service.js";
import { syncDriveFileNames } from "../../service/fileNameSync.service.js";
import { JOB_REFERENCE_TYPES } from "../../constants/driveFile.js";
import { MODULES, ACTIONS } from "../../constants/rbac.js";
import { DOCUMENT_SYNC_SCOPES as SCOPE, DOCUMENT_SYNC_SCOPE_NAMES } from "../../constants/documentSync.js";
import { resolveUserEntityIds } from "../documents/documents.user-scope.js";

/**
 * Document name sync — one endpoint, every entity that owns documents.
 *
 * A document is named when it is uploaded, from the format the administrator
 * sets under Admin → Document → File Naming. Change that format afterwards and
 * everything already stored keeps its old name, so a Documents tab ends up a mix
 * of conventions. "Sync Names" re-applies the current format to what is already
 * there.
 *
 * Nothing here is entity-specific: each scope only has to say how to find its
 * files and which tokens describe it. Adding "maintenance" or "estate" later
 * means one entry in constants/documentSync.js plus one here — no new route,
 * controller, service, thunk or button.
 */

/**
 * @typedef {object} DocumentSyncScope
 * @property {string}   label     human name, used in messages
 * @property {string}   module    RBAC module the caller needs UPDATE on
 * @property {Function} collect   (entityId, user) => collected | null
 * @property {Function} files     collected => DriveFile[] to re-name
 * @property {Function} naming    (collected, entityId) => token context for
 *                                resolveNamingData
 */

/** @type {Record<string, DocumentSyncScope>} */
export const DOCUMENT_SYNC_SCOPE_CONFIG = {
  [SCOPE.LEAD]: {
    label: "Lead",
    module: MODULES.LEAD,
    collect: (entityId, user) =>
      leadsService.collectLeadDriveFiles(entityId, user?.builder_id, user?.company_id),
    // Job-generated PDFs can carry this lead_id but belong to a job; the Lead
    // Documents tab hides them, so the lead sync must not rename them either.
    files: (collected) => collected.driveFiles.filter((f) => !JOB_REFERENCE_TYPES.has(f.reference_type)),
    naming: (collected, entityId) => ({
      leadId: entityId,
      fullName: collected.lead?.name,
      referenceNumber: collected.lead?.reference_number,
    }),
  },

  [SCOPE.JOB]: {
    label: "Job",
    module: MODULES.JOB,
    collect: (entityId, user) => jobService.collectJobDriveFiles(entityId, user),
    files: (collected) => collected.driveFiles,
    // resolveNamingData walks job -> opportunity -> lead for the customer name
    // and address, and prefers the job's own reference number — the same path
    // the uploader took when it first named these files.
    naming: (_collected, entityId) => ({ jobId: entityId }),
  },

  [SCOPE.USER]: {
    label: "User",
    // Spans leads and jobs together, so it is gated on the Document module
    // rather than on either one.
    module: MODULES.DOCUMENT,
    /**
     * A user owns no files directly — theirs live under many leads and jobs, and
     * each needs ITS OWN naming tokens (customer name, address, reference
     * number). One collect/files/naming pass would stamp every document with a
     * single entity's tokens, so this scope instead re-runs the lead and job
     * syncs over everything the user is attached to and adds up the results.
     *
     * Leads first, then jobs: a quotation's PDFs belong to both trees, and the
     * job's reference number is the more current identity, so letting the job
     * pass run last leaves shared files named the way the Job tab shows them.
     */
    fanOut: async (entityId, user) => {
      const resolved = await resolveUserEntityIds(entityId, user);
      if (!resolved) return null;
      return [
        ...resolved.leadIds.map((id) => ({ scope: SCOPE.LEAD, entityId: id })),
        ...resolved.jobIds.map((id) => ({ scope: SCOPE.JOB, entityId: id })),
      ];
    },
  },
};

// Every advertised scope must actually be implemented here — catches a scope
// added to the constants (and so to the request schema) but never wired up.
for (const scope of DOCUMENT_SYNC_SCOPE_NAMES) {
  if (!DOCUMENT_SYNC_SCOPE_CONFIG[scope]) {
    throw new Error(`drive-name-sync: no handler registered for document scope "${scope}"`);
  }
}

/** RBAC module + action a given scope requires, or null for an unknown scope. */
export function permissionForScope(scope) {
  const config = DOCUMENT_SYNC_SCOPE_CONFIG[scope];
  return config ? { module: config.module, action: ACTIONS.UPDATE } : null;
}

/**
 * Re-name every document held by one entity so it matches the configured format.
 *
 * `[Full Name]`, `[Address]` and `[Reference Number]` are resolved once for the
 * entity; `[Created Date]` and `[FileType]` come from each file, so a document
 * keeps its own age and type instead of inheriting the sync's.
 *
 * @param {object} params
 * @param {string} params.scope     a DOCUMENT_SYNC_SCOPES value ("lead", "job")
 * @param {string} params.entityId  the lead / job id
 * @param {object} params.user      req.user — supplies scoping + the audit trail
 */
export async function syncDocumentNames({ scope, entityId, user }) {
  const config = DOCUMENT_SYNC_SCOPE_CONFIG[scope];
  if (!config) {
    return {
      success: false,
      statusCode: 400,
      message: `Unknown document scope "${scope}". Expected one of: ${DOCUMENT_SYNC_SCOPE_NAMES.join(", ")}.`,
    };
  }

  if (config.fanOut) {
    return syncFannedOutDocumentNames({ scope, entityId, user, config });
  }

  try {
    const collected = await config.collect(entityId, user);
    if (!collected) {
      return { success: false, statusCode: 404, message: `${config.label} not found` };
    }

    const files = config.files(collected) || [];
    if (!files.length) {
      return {
        success: true,
        data: { scope, entityId, total: 0, renamed: 0, unchanged: 0, files: [] },
        message: "No documents to rename",
      };
    }

    const companyId = user?.company_id || null;
    const builderId = user?.builder_id || null;

    const [format, namingData] = await Promise.all([
      getNamingFormat({ companyId, builderId }),
      resolveNamingData(config.naming(collected, entityId)),
    ]);

    const result = await syncDriveFileNames({
      files,
      format,
      namingData,
      companyId,
      userId: user?.users_id || null,
    });

    return {
      success: true,
      data: { scope, entityId, ...result },
      message: result.renamed
        ? `${result.renamed} of ${result.total} document${result.total === 1 ? "" : "s"} renamed`
        : "All documents already match the configured file name format",
    };
  } catch (error) {
    console.error("[DocumentNameSync] Failed to sync document names:", error);
    // A name lost to a concurrent upload is a 409 the client can retry; anything
    // else is ours.
    return { success: false, statusCode: error.statusCode || 500, message: error.message };
  }
}

/**
 * Run a fan-out scope: sync each underlying entity in turn and add the results
 * up into the same envelope a single-entity sync returns, so the caller and the
 * "Sync Names" button need no special case.
 *
 * Sequential on purpose. `drive_files.file_name` is UNIQUE across the whole
 * table and each per-entity sync opens its own transaction, so running them
 * concurrently would have two batches reserving names against each other and
 * failing with spurious 409s.
 *
 * One entity failing does not sink the rest — its error is collected and
 * reported alongside what did succeed, because a partial rename is still
 * progress and re-running is safe (already-correct files are left alone).
 */
async function syncFannedOutDocumentNames({ scope, entityId, user, config }) {
  let targets;
  try {
    targets = await config.fanOut(entityId, user);
  } catch (error) {
    console.error("[DocumentNameSync] Fan-out failed:", error);
    return { success: false, statusCode: 500, message: error.message };
  }

  if (!targets) {
    return { success: false, statusCode: 404, message: `${config.label} not found` };
  }

  const totals = { total: 0, renamed: 0, unchanged: 0 };
  const files = [];
  const failures = [];

  for (const target of targets) {
    const result = await syncDocumentNames({ ...target, user });
    if (!result.success) {
      failures.push(`${target.scope} ${target.entityId}: ${result.message}`);
      continue;
    }
    totals.total += result.data.total;
    totals.renamed += result.data.renamed;
    totals.unchanged += result.data.unchanged;
    files.push(...result.data.files);
  }

  if (failures.length && !totals.total) {
    return {
      success: false,
      statusCode: 500,
      message: `Could not rename any documents. ${failures[0]}`,
    };
  }

  const summary = totals.renamed
    ? `${totals.renamed} of ${totals.total} document${totals.total === 1 ? "" : "s"} renamed across ${targets.length} lead${targets.length === 1 ? "" : "s"}/job${targets.length === 1 ? "" : "s"}`
    : "All documents already match the configured file name format";

  return {
    success: true,
    data: { scope, entityId, ...totals, files, entityCount: targets.length, failures },
    // Never claim a clean run when part of it failed.
    message: failures.length ? `${summary}. ${failures.length} could not be synced.` : summary,
  };
}

export default { DOCUMENT_SYNC_SCOPE_CONFIG, permissionForScope, syncDocumentNames };
