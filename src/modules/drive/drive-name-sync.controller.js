import { errorResponse, successResponse, handleControllerError } from "../../helper/response.js";
import requirePermission from "../../middleware/rbac/requirePermission.js";
import {
  DOCUMENT_SYNC_SCOPE_CONFIG,
  permissionForScope,
  syncDocumentNames,
} from "./drive-name-sync.service.js";
import { DOCUMENT_SYNC_SCOPE_NAMES } from "../../constants/documentSync.js";

/**
 * Permission guard for a scope-driven route.
 *
 * The module to check depends on the payload — a lead sync needs LEAD.update, a
 * job sync JOB.update — so the usual `requirePermission(MODULE, ACTION)` cannot
 * be pinned at mount time. The guards are still built once, up front, and simply
 * chosen per request.
 */
const GUARD_BY_SCOPE = Object.fromEntries(
  DOCUMENT_SYNC_SCOPE_NAMES.map((scope) => {
    const { module, action } = permissionForScope(scope);
    return [scope, requirePermission(module, action)];
  }),
);

export function requireDocumentScopePermission(req, res, next) {
  const guard = GUARD_BY_SCOPE[req.body?.scope];
  if (!guard) {
    return errorResponse(
      res,
      400,
      `Unknown document scope "${req.body?.scope}". Expected one of: ${DOCUMENT_SYNC_SCOPE_NAMES.join(", ")}.`,
    );
  }
  return guard(req, res, next);
}

/**
 * POST /drive/documents/sync-names
 * Body: { scope: "lead" | "job", entity_id: "<uuid>" }
 *
 * Re-names every document held by that entity so it matches the naming format
 * configured under Admin → Document → File Naming. Backs the "Sync Names"
 * button on every Documents tab.
 */
export async function syncDocumentNamesController(req, res) {
  try {
    const { scope, entity_id: entityId } = req.body;

    if (!req.user?.builder_id && !req.user?.company_id) {
      return errorResponse(res, 401, "Unauthorized: Builder or company ID missing");
    }

    const result = await syncDocumentNames({ scope, entityId, user: req.user });

    if (result.success) {
      return successResponse(res, result.data, result.message);
    }
    return errorResponse(res, result.statusCode || 400, result.message);

  } catch (error) {
    console.error("Sync document names error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

/**
 * GET /drive/documents/sync-names/scopes
 * The entity types this deployment can sync, so a client never has to hardcode
 * the list.
 */
export function getDocumentSyncScopes(req, res) {
  const scopes = DOCUMENT_SYNC_SCOPE_NAMES.map((scope) => ({
    scope,
    label: DOCUMENT_SYNC_SCOPE_CONFIG[scope].label,
    module: DOCUMENT_SYNC_SCOPE_CONFIG[scope].module,
  }));
  return successResponse(res, scopes, "Document sync scopes fetched successfully");
}
