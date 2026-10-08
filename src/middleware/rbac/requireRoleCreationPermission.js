/**
 * Phase 1 — Role creation guard.
 *
 * Blocks any user-creation request where the requester's role is not allowed
 * to create the target role (per ROLE_CREATION_MATRIX, Section 3.1 of the
 * design doc).
 *
 * Usage:
 *   router.post("/", authMiddleware, requireRoleCreationPermission(), ...)
 *
 * Configure target-role lookup with `targetRoleFrom`:
 *   - "body.role_id" (default): expects req.body.role_id, resolves to role name
 *   - "body.role_name": expects req.body.role_name directly
 *   - a function (req) => Promise<string|null> for anything custom
 */

import { errorResponse } from "../../helper/response.js";
import { canCreateRole } from "../../constants/rbac.js";
import { getRoleNameById } from "../../helper/rbac.helper.js";

const DEFAULT_FROM = "body.role_id";

async function resolveTargetRoleName(req, targetRoleFrom) {
  if (typeof targetRoleFrom === "function") {
    return targetRoleFrom(req);
  }

  if (targetRoleFrom === "body.role_name") {
    return req.body?.role_name || null;
  }

  // Default: body.role_id → role.name
  const roleId = req.body?.role_id;
  if (!roleId) return null;
  return getRoleNameById(roleId);
}

export default function requireRoleCreationPermission({ targetRoleFrom = DEFAULT_FROM } = {}) {
  return async (req, res, next) => {
    try {
      const creatorRoleName = req.user?.role_name;
      if (!creatorRoleName) {
        return errorResponse(res, 403, "Forbidden: creator role is missing");
      }

      const roleId = req.body?.role_id;
      let targetRoleName = await resolveTargetRoleName(req, targetRoleFrom);
      
      if (!targetRoleName) {
        return errorResponse(res, 400, "Bad request: target role is required");
      }

      // 1. If it's a known system role, check via the matrix
      const { ROLES } = await import("../../constants/rbac.js");
      const isSystemRole = Object.values(ROLES).includes(targetRoleName);
      
      if (isSystemRole) {
        if (!canCreateRole(creatorRoleName, targetRoleName)) {
          return errorResponse(
            res,
            403,
            `Forbidden: role "${creatorRoleName}" is not permitted to create "${targetRoleName}"`,
          );
        }
        return next();
      }

      // 2. For Custom Roles, enforce hierarchy via database lookup
      if (roleId) {
        const db = (await import("../../config/database/models/postgre-models/index.js")).default;
        const role = await db.Role.findByPk(roleId);
        if (!role) return errorResponse(res, 404, "Target role not found");

        const COMPANY_ADMIN_ROLES = [
          ROLES.SUPER_ADMIN,
          ROLES.COMPANY_ADMINISTRATOR,
          ROLES.MH_COMPANY_ADMIN,
          ROLES.MY_HOME_COMPANY_ADMIN,
          ROLES.MY_HOME_ADMIN,
        ];

        if (COMPANY_ADMIN_ROLES.includes(creatorRoleName)) {
          return next(); // Admins can assign any custom role
        }

        if (creatorRoleName === ROLES.BUILDER) {
          if (role.builder_id === req.user.builder_id) {
            return next(); // Builder can assign custom roles they own
          }
        }

        return errorResponse(res, 403, `Forbidden: "${creatorRoleName}" cannot assign custom role "${targetRoleName}"`);
      }

      // Fallback for custom roles without a role_id in the body (shouldn't happen)
      if (!canCreateRole(creatorRoleName, targetRoleName)) {
        return errorResponse(
          res,
          403,
          `Forbidden: role "${creatorRoleName}" is not permitted to create "${targetRoleName}"`,
        );
      }

      return next();
    } catch (err) {
      console.error("requireRoleCreationPermission error:", err);
      return errorResponse(res, 500, "Internal RBAC error");
    }
  };
}
