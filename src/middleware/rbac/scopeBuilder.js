/**
 * Phase 2 — Tenant scoping middleware.
 *
 * Resolves the requester's role name (using the role-name cache) and attaches
 * a `req.scope` envelope that downstream code consumes to build query filters:
 *
 *   req.scope = {
 *     roleName,          // "Sales Manager" etc.
 *     tier,              // 1 | 2 | 3
 *     scope,             // SCOPES enum value
 *     isSuperAdmin,      // platform-wide
 *     isCompanyScoped,   // tier-2 admins
 *     isBuilderScoped,   // tier-3 + builder-tier-2
 *     companyId,         // null for Super Admin
 *     builderId,         // null for Super Admin / Company admins
 *     userId,
 *   }
 *
 * Mounted globally AFTER authMiddleware. Does NOT enforce — enforcement is
 * the job of requirePermission and the service-side applyTenantScope helper.
 */

import { errorResponse } from "../../helper/response.js";
import { SCOPES, ROLES, getRoleScope, getRoleTier } from "../../constants/rbac.js";
import { getRoleNameById } from "../../helper/rbac.helper.js";

export default async function scopeBuilder(req, res, next) {
  try {
    if (!req.user || !req.user.role_id) {
      // Unauthenticated requests shouldn't have hit this — but don't crash.
      return next();
    }

    const roleName = await getRoleNameById(req.user.role_id);
    if (!roleName) {
      return errorResponse(res, 403, "Forbidden: unknown role");
    }
    req.user.role_name = roleName;

    const scope = getRoleScope(roleName);
    const tier = getRoleTier(roleName);
    const isSuperAdmin = roleName === ROLES.SUPER_ADMIN;
    const isCompanyScoped = scope === SCOPES.COMPANY;
    const isBuilderScoped = !isSuperAdmin && !isCompanyScoped;

    req.scope = {
      roleName,
      tier,
      scope,
      isSuperAdmin,
      isCompanyScoped,
      isBuilderScoped,
      companyId: isSuperAdmin ? null : req.user.company_id || null,
      builderId: isSuperAdmin || isCompanyScoped ? null : req.user.builder_id || null,
      userId: req.user.users_id || req.user.id || null,
    };

    return next();
  } catch (err) {
    console.error("scopeBuilder error:", err);
    return errorResponse(res, 500, "Internal RBAC error");
  }
}
