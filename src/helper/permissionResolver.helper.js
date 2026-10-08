/**
 * P2 — Dynamic permission resolver.
 *
 * Implements the three-tier precedence defined in §6 of the spec:
 *   1. Company override row  — role_permission WHERE role_id=? AND company_id=?
 *   2. Global default row    — role_permission WHERE role_id=? AND company_id IS NULL AND builder_id IS NULL
 *   3. Hard fallback         — in-code static MODULE_PERMISSIONS matrix
 *   4. Default: deny.
 *
 * Results are cached per (roleId, companyId) so there is no DB hit on every
 * request. The cache is invalidated when a Company Admin saves changes via
 * PUT /role/:id/permissions.
 *
 * Cache key: `${roleId}:${companyId ?? "global"}`
 */

import db from "../config/database/models/postgre-models/index.js";
import { Op } from "sequelize";
import { MODULE_PERMISSIONS, MODULES, ACTIONS } from "../constants/rbac.js";

// ─── In-memory permission cache ───────────────────────────────────────────────
// Map<cacheKey, { [moduleName]: { create, read, update, delete } }>
const permissionCache = new Map();

// Map<cacheKey, roleId> — resolves a platform template role (role.company_id
// IS NULL) to the company's own copy of that role. See resolveTenantRoleId.
const roleScopeCache = new Map();

/**
 * Build the cache key for a (roleId, companyId) pair.
 * companyId=null means "global" (Super Admin / no company context).
 */
function cacheKey(roleId, companyId) {
  return `${roleId}:${companyId ?? "global"}`;
}

/**
 * Invalidate the in-memory cache for a specific (roleId, companyId).
 * Call this whenever permissions for a role are saved/updated.
 * Pass companyId=null to clear the global default cache.
 */
export function invalidatePermissionCache(roleId, companyId) {
  permissionCache.delete(cacheKey(roleId, companyId));
  roleScopeCache.delete(cacheKey(roleId, companyId));
}

/**
 * Invalidate ALL cache entries for a given company.
 * Useful when bulk-upserting a role's full permission matrix.
 */
export function invalidateCompanyPermissionCache(companyId) {
  const suffix = `:${companyId ?? "global"}`;
  for (const key of permissionCache.keys()) {
    if (key.endsWith(suffix)) {
      permissionCache.delete(key);
    }
  }
  // Creating/deleting a company role changes which row a global-role user
  // resolves to, so drop the scope mapping for this company as well.
  for (const key of roleScopeCache.keys()) {
    if (key.endsWith(suffix)) {
      roleScopeCache.delete(key);
    }
  }
}

/**
 * Invalidate the entire in-memory permission cache.
 */
export function flushPermissionCache() {
  permissionCache.clear();
  roleScopeCache.clear();
}

/**
 * Map a role_id onto the row that actually carries this company's permissions.
 *
 * Every company is provisioned with its own copy of each system role, and the
 * Role Management screen only ever reads and writes those company-scoped rows.
 * A user attached to the global template row (role.company_id IS NULL) would
 * otherwise resolve against the platform defaults, so nothing a Company Admin
 * ticks in the grid would ever reach them. Translate to the company's copy of
 * the same role name; keep the original id when no copy exists (company not
 * provisioned yet, or a genuinely platform-scoped account).
 */
async function resolveTenantRoleId(roleId, companyId) {
  if (!roleId || !companyId) return roleId;

  const key = cacheKey(roleId, companyId);
  if (roleScopeCache.has(key)) return roleScopeCache.get(key);

  let resolved = roleId;
  try {
    const role = await db.Role.findByPk(roleId, {
      attributes: ["role_id", "name", "company_id"],
      raw: true,
    });

    if (role && role.company_id === null) {
      const companyRole = await db.Role.findOne({
        where: { name: role.name, company_id: companyId },
        attributes: ["role_id"],
        raw: true,
      });
      if (companyRole) resolved = companyRole.role_id;
    }
  } catch (err) {
    console.error("[permissionResolver] tenant role resolution failed:", err.message);
    return roleId; // don't poison the cache on a transient DB error
  }

  roleScopeCache.set(key, resolved);
  return resolved;
}

/**
 * Load effective permissions for a (roleId, companyId) pair from the DB.
 * Applies the two-DB-tier lookup (company override → global default) and
 * caches the merged result.
 *
 * Returns a Map of { moduleName → { create, read, update, delete } }.
 */
async function loadFromDb(roleId, companyId) {
  const { RolePermission } = db;

  // Fetch both company-specific AND global rows in one query, ordered so that
  // company-specific rows sort before global rows.
  //
  // NOTE: "global" rows are those with company_id IS NULL (regardless of
  // builder_id). Previously this clause used { company_id: null, builder_id: null }
  // which missed rows inserted by upsertRolePermissions when the caller had a
  // builder_id (those rows have company_id=null, builder_id=<uuid>). The first
  // clause already captures company-specific rows, so we only need to match on
  // company_id IS NULL here.
  const rows = await RolePermission.findAll({
    where: {
      role_id: roleId,
      is_active: true,
      [Op.or]: [
        ...(companyId ? [{ company_id: companyId }] : []),
        { company_id: null },
      ],
    },
    attributes: ["module_name", "company_id", "can_create", "can_read", "can_update", "can_delete"],
    raw: true,
  });

  // Build merged map: company-specific wins over global (first write wins as
  // we process company rows first)
  const companyRows = rows.filter(r => r.company_id !== null && r.company_id === companyId);
  const globalRows = rows.filter(r => r.company_id === null);

  const merged = new Map();

  // Company-specific rows have highest priority
  for (const row of companyRows) {
    merged.set(row.module_name, {
      [ACTIONS.CREATE]: row.can_create,
      [ACTIONS.READ]: row.can_read,
      [ACTIONS.UPDATE]: row.can_update,
      [ACTIONS.DELETE]: row.can_delete,
    });
  }

  // Global rows fill in any module not overridden by company rows
  for (const row of globalRows) {
    if (!merged.has(row.module_name)) {
      merged.set(row.module_name, {
        [ACTIONS.CREATE]: row.can_create,
        [ACTIONS.READ]: row.can_read,
        [ACTIONS.UPDATE]: row.can_update,
        [ACTIONS.DELETE]: row.can_delete,
      });
    }
  }

  return merged;
}

/**
 * Get the effective permission map for a (roleId, companyId) pair.
 * Uses cache; falls back to DB on miss.
 * Returns Map<moduleName, { create, read, update, delete }>.
 */
async function getEffectivePermissionMap(roleId, companyId) {
  const tenantRoleId = await resolveTenantRoleId(roleId, companyId);
  const key = cacheKey(tenantRoleId, companyId);
  if (permissionCache.has(key)) {
    return permissionCache.get(key);
  }

  const dbMap = await loadFromDb(tenantRoleId, companyId);
  permissionCache.set(key, dbMap);
  return dbMap;
}

/**
 * Resolve whether a user has the given action on the given module.
 *
 * Tier order:
 *   1. Company-specific DB row  (if companyId present)
 *   2. Global DB row            (company_id IS NULL, builder_id IS NULL)
 *   3. Static in-code matrix   (last resort — guarantees no regression)
 *   4. Deny
 *
 * @param {object} user       — req.user (must have role_id, role_name, company_id)
 * @param {string} moduleName — MODULES.* constant
 * @param {string} action     — ACTIONS.* constant
 * @returns {Promise<boolean>}
 */
export async function resolvePermission(user, moduleName, action) {
  const roleId = user?.role_id;
  const companyId = user?.company_id ?? null;
  const roleName = user?.role_name;

  if (!roleId || !moduleName || !action) return false;

  try {
    const permMap = await getEffectivePermissionMap(roleId, companyId);

    // 1. Company override or global DB row (both are in permMap via priority)
    if (permMap.has(moduleName)) {
      return permMap.get(moduleName)[action] === true;
    }

    // 2. Global-only lookup (in case we have no company context)
    if (companyId) {
      const globalMap = await getEffectivePermissionMap(roleId, null);
      if (globalMap.has(moduleName)) {
        return globalMap.get(moduleName)[action] === true;
      }
    }

    // 3. Hard fallback to static matrix
    if (roleName) {
      const staticPerms = MODULE_PERMISSIONS[roleName];
      if (staticPerms && staticPerms[moduleName]) {
        return staticPerms[moduleName][action] === true;
      }
    }
  } catch (err) {
    console.error("[permissionResolver] DB error, falling back to static matrix:", err.message);
    // Fall through to static fallback on any DB error
    if (roleName) {
      const staticPerms = MODULE_PERMISSIONS[roleName];
      if (staticPerms && staticPerms[moduleName]) {
        return staticPerms[moduleName][action] === true;
      }
    }
  }

  // 4. Deny
  return false;
}

/**
 * Build the full effective permission map for a user — all modules, all actions.
 * Used by /auth/me so the frontend gets the DB-driven matrix instead of static.
 *
 * @param {object} user — req.user
 * @returns {Promise<object>} { moduleName: { create, read, update, delete } }
 */
export async function getEffectivePermissionsForUser(user) {
  const roleId = user?.role_id;
  const companyId = user?.company_id ?? null;
  const roleName = user?.role_name;

  const out = {};

  // Start from static matrix as baseline (ensures all modules are present)
  if (roleName && MODULE_PERMISSIONS[roleName]) {
    for (const [mod, actions] of Object.entries(MODULE_PERMISSIONS[roleName])) {
      out[mod] = { ...actions };
    }
  } else {
    // Ensure all modules are present as deny
    for (const mod of Object.values(MODULES)) {
      out[mod] = {
        [ACTIONS.CREATE]: false,
        [ACTIONS.READ]: false,
        [ACTIONS.UPDATE]: false,
        [ACTIONS.DELETE]: false,
      };
    }
  }

  if (!roleId) return out;

  try {
    const permMap = await getEffectivePermissionMap(roleId, companyId);
    for (const [mod, actions] of permMap.entries()) {
      out[mod] = { ...actions };
    }

    // Also merge global rows for any module not covered by company override
    if (companyId) {
      const globalMap = await getEffectivePermissionMap(roleId, null);
      for (const [mod, actions] of globalMap.entries()) {
        if (!permMap.has(mod)) {
          out[mod] = { ...actions };
        }
      }
    }
  } catch (err) {
    console.error("[permissionResolver] getEffectivePermissionsForUser DB error:", err.message);
  }

  return out;
}

export default {
  resolvePermission,
  getEffectivePermissionsForUser,
  invalidatePermissionCache,
  invalidateCompanyPermissionCache,
  flushPermissionCache,
};
