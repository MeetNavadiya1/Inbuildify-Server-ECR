/**
 * Role deny-list guard — the inverse of roleMiddleware([...]).
 *
 *   router.use(denyRoles(ROLES.CONTACT));
 *
 * For endpoints whose data is tenant-wide (every lead, job or file in the
 * builder/company) and therefore must never reach a customer, even when the
 * permission matrix grants their role read on the same module for their own
 * rows. Reads `req.user.role_name`, which authMiddleware resolves, so it must
 * run after authMiddleware.
 */

import { errorResponse } from "../../helper/response.js";

export default function denyRoles(...roles) {
  const denied = new Set(roles.flat());
  return (req, res, next) => {
    const roleName = req.user?.role_name || req.scope?.roleName;
    if (roleName && denied.has(roleName)) {
      return errorResponse(res, 403, `Forbidden: role "${roleName}" cannot access this resource`);
    }
    return next();
  };
}
