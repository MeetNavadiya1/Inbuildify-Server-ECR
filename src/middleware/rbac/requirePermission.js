/**
 * P2 (updated) — Module-level permission guard.
 *
 *   router.get(
 *     "/leads",
 *     authMiddleware,
 *     scopeBuilder,
 *     requirePermission(MODULES.LEAD, ACTIONS.READ),
 *     leadController.list,
 *   );
 *
 *
 * Returns 403 if the role does not have the requested action on the module.
 * Row-level scoping (assigned-to / supervisor-of) is NOT enforced here — it
 * is the service's responsibility via applyRowScope. This guard answers
 * "can the role do this action at all?", not "on which rows?".
 *
 * Permission resolution (§6 precedence):
 *   1. Company-specific DB row (per-company override, highest priority)
 *   2. Global default DB row   (platform baseline, company_id IS NULL)
 *   3. Static in-code matrix   (fallback — guarantees no regression for
 *                               any role/module that has no DB row yet)
 *   4. Deny
 */

import { errorResponse } from "../../helper/response.js";
import { resolvePermission } from "../../helper/permissionResolver.helper.js";

export default function requirePermission(moduleName, action) {
  if (!moduleName || !action) {
    throw new Error("requirePermission: moduleName and action are required");
  }
  return async (req, res, next) => {
    const roleName = req.user?.role_name || req.scope?.roleName;
    if (!roleName) {
      return errorResponse(res, 403, "Forbidden: role not resolved");
    }

    const allowed = await resolvePermission(req.user, moduleName, action);
    if (!allowed) {
      return errorResponse(
        res,
        403,
        `Forbidden: role "${roleName}" cannot ${action} ${moduleName}`,
      );
    }
    return next();
  };
}
