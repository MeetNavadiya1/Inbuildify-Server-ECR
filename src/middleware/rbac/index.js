/**
 * Single import surface for RBAC middleware. Pair with the helpers in
 * src/helper/rbac.helper.js (applyTenantScope, applyRowScope, buildScopedWhere)
 * which run inside services rather than as middleware.
 *
 * P2 addition: also exports cache-invalidation helpers from permissionResolver
 * so callers only need one import.
 */
export { default as requireRoleCreationPermission } from "./requireRoleCreationPermission.js";
export { default as scopeBuilder } from "./scopeBuilder.js";
export { default as requirePermission } from "./requirePermission.js";
export { default as denyRoles } from "./denyRoles.js";
export {
  ROLES,
  MODULES,
  ACTIONS,
  SCOPES,
  canCreateRole,
  hasModulePermission,
  getRoleScope,
  getRoleTier,
} from "../../constants/rbac.js";
export {
  invalidatePermissionCache,
  invalidateCompanyPermissionCache,
  flushPermissionCache,
} from "../../helper/permissionResolver.helper.js";
