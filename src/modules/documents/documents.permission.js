import { errorResponse } from "../../helper/response.js";
import { resolvePermission } from "../../helper/permissionResolver.helper.js";
import { getEntityAdapter } from "./documents.entities.js";

/**
 * Dynamic RBAC guard for the generic documents API.
 *
 * `requirePermission(MODULES.JOB, ACTIONS.UPDATE)` fixes the module + action at
 * route-registration time, but here they depend on the request's `entityType`
 * (job → JOB, lead → LEAD, sdrive → DOCUMENT) and on the operation. This guard
 * resolves the adapter from the request, then applies the same §6 precedence
 * check `resolvePermission` performs for the static guard.
 *
 * @param {"read"|"folder"|"upload"} operation
 */
export default function requireEntityPermission(operation) {
  return async (req, res, next) => {
    // entityType arrives snake_cased on the body (POST) or camelCased on the
    // query (GET); both are read here so ordering with the case converter is safe.
    const entityType = (
      req.body?.entity_type ??
      req.body?.entityType ??
      req.query?.entityType ??
      req.query?.entity_type ??
      ""
    ).toString();

    const adapter = getEntityAdapter(entityType);
    if (!adapter) {
      return errorResponse(res, 400, "Unsupported or missing entity type");
    }

    const action = adapter.actions?.[operation];
    if (!action) {
      return errorResponse(res, 400, `Unsupported operation "${operation}" for ${adapter.label}`);
    }

    const roleName = req.user?.role_name || req.scope?.roleName;
    if (!roleName) {
      return errorResponse(res, 403, "Forbidden: role not resolved");
    }

    const allowed = await resolvePermission(req.user, adapter.module, action);
    if (!allowed) {
      return errorResponse(
        res,
        403,
        `Forbidden: role "${roleName}" cannot ${action} ${adapter.module}`,
      );
    }

    return next();
  };
}
