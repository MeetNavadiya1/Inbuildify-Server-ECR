/**
 * RBAC runtime helpers — bridge between the static constants in
 * src/constants/rbac.js and live request data.
 *
 *  - In-memory caches map role_id ↔ role_name so every permission check
 *    doesn't round-trip to Postgres. Caches are invalidated by name on demand
 *    (called from the role admin endpoints).
 *  - applyTenantScope / applyRowScope return a Sequelize `where` patch that
 *    the calling service merges into its query. They never mutate the input.
 *  - getEffectivePermissions is now async and DB-backed (P2 — dynamic RBAC).
 */

import db from "../config/database/models/postgre-models/index.js";
import { Op } from "sequelize";
import {
  ROLES,
  SCOPES,
  ROLE_SCOPES,
  MODULE_PERMISSIONS,
  hasModulePermission,
  getRoleScope,
} from "../constants/rbac.js";
import {
  getEffectivePermissionsForUser,
  invalidatePermissionCache,
  invalidateCompanyPermissionCache,
  flushPermissionCache,
} from "./permissionResolver.helper.js";

// Re-export cache helpers so role management service can import from here
export { invalidatePermissionCache, invalidateCompanyPermissionCache, flushPermissionCache };

const roleIdToName = new Map();
const roleNameToId = new Map();

export async function getRoleNameById(roleId) {
  if (!roleId) return null;
  if (roleIdToName.has(roleId)) return roleIdToName.get(roleId);
  const row = await db.Role.findByPk(roleId, { attributes: ["role_id", "name"] });
  if (!row) return null;
  roleIdToName.set(row.role_id, row.name);
  roleNameToId.set(row.name, row.role_id);
  return row.name;
}

export async function getRoleIdByName(roleName) {
  if (!roleName) return null;
  if (roleNameToId.has(roleName)) return roleNameToId.get(roleName);
  const row = await db.Role.findOne({ where: { name: roleName }, attributes: ["role_id", "name"] });
  if (!row) return null;
  roleIdToName.set(row.role_id, row.name);
  roleNameToId.set(row.name, row.role_id);
  return row.role_id;
}

export function invalidateRoleCache() {
  roleIdToName.clear();
  roleNameToId.clear();
}

/**
 * Resolve the role row a *user* of the given company should be attached to.
 *
 * Every company gets its own copy of each system role (see seedCompanyRbac), and
 * Settings → Role Management only lists and edits those company-scoped rows. A
 * user pinned to the global template row (role.company_id IS NULL) is therefore
 * invisible to the permission grid: whatever the Company Admin ticks there is
 * written against the company copy and never reaches that user. Always attach
 * users to the company copy — fall back to the global row only when the company
 * has not been provisioned yet.
 *
 * @param {string} roleName    e.g. "Contact"
 * @param {string} companyId   the tenant the user belongs to
 * @param {object} [options]   { transaction, exact } — `exact: false` matches the
 *                             name case-insensitively (default true)
 * @returns {Promise<object|null>} the role row ({ role_id, name, company_id }) or null
 */
export async function findRoleForCompany(roleName, companyId, options = {}) {
  if (!roleName) return null;
  const { transaction = null, exact = true } = options;
  const nameWhere = exact ? roleName : { [Op.iLike]: roleName };

  if (companyId) {
    const companyRole = await db.Role.findOne({
      where: { name: nameWhere, company_id: companyId },
      attributes: ["role_id", "name", "company_id"],
      transaction,
    });
    if (companyRole) return companyRole;
  }

  // Company not provisioned yet (or no company context) — fall back to the
  // platform template row so the caller still gets a usable role.
  return db.Role.findOne({
    where: { name: nameWhere, company_id: null },
    attributes: ["role_id", "name", "company_id"],
    transaction,
  });
}

/** Convenience wrapper around findRoleForCompany that returns just the id. */
export async function findRoleIdForCompany(roleName, companyId, options = {}) {
  const role = await findRoleForCompany(roleName, companyId, options);
  return role ? role.role_id : null;
}

/**
 * Normalise a role_id that arrived from a client onto the caller's own company
 * copy of that role.
 *
 * The role dropdowns are company-scoped, but a role_id can still reach us
 * pointing at another row with the same name — the global template row
 * (company_id IS NULL) when the form was pre-filled from a user created before
 * the per-company roles existed, or a stale id cached by the frontend. Left
 * as-is, two people who are both "Contact" end up on two different role rows,
 * and only one of them is the row Role Management actually edits.
 *
 * Resolution, by name, always lands on the company copy when one exists:
 *   - already this company's row  → unchanged
 *   - global template row         → the company copy (or unchanged when the
 *                                   company has not been provisioned yet)
 *   - another company's row       → this company's role of the same name, or a
 *                                   400 when there is none (cross-tenant id)
 *
 * @param {string} roleId      role_id as supplied by the caller
 * @param {string} companyId   the tenant the user belongs to
 * @param {object} [options]   { transaction }
 * @returns {Promise<string|null>} the role_id to persist
 */
export async function resolveRoleIdForCompany(roleId, companyId, options = {}) {
  if (!roleId) return roleId ?? null;
  if (!companyId) return roleId;

  const { transaction = null } = options;

  const role = await db.Role.findByPk(roleId, {
    attributes: ["role_id", "name", "company_id"],
    transaction,
  });

  // Unknown id — leave it alone so the caller's own validation reports it.
  if (!role) return roleId;
  if (role.company_id === companyId) return role.role_id;

  const companyRole = await findRoleForCompany(role.name, companyId, { transaction });
  if (companyRole && companyRole.company_id === companyId) return companyRole.role_id;

  // A role owned by a different company with no counterpart here is never
  // assignable; the global template row is, when this company has no copy yet.
  if (role.company_id !== null) {
    throw {
      status: 400,
      message: "The selected role does not belong to your company.",
    };
  }

  return role.role_id;
}

/**
 * Flat map of all (module, action) permissions for the given user — used by
 * /auth/me so the frontend can render menus without re-deriving the matrix.
 *
 * Now async and DB-backed (P2 — dynamic RBAC). Falls back to the static
 * matrix if the DB is unavailable or no rows exist.
 *
 * @param {object} user — req.user (must have role_id, role_name, company_id)
 */
export async function getEffectivePermissions(user) {
  // Support legacy call-sites that pass just a roleName string
  if (typeof user === "string") {
    const roleName = user;
    const rolePerms = MODULE_PERMISSIONS[roleName];
    if (!rolePerms) return {};
    const out = {};
    for (const [mod, actions] of Object.entries(rolePerms)) {
      out[mod] = { ...actions };
    }
    return out;
  }
  return getEffectivePermissionsForUser(user);
}

export function userCan(roleName, moduleName, action) {
  return hasModulePermission(roleName, moduleName, action);
}

/**
 * Tenant-level scope filter.
 *   - Platform (Super Admin): no filter.
 *   - Company-scoped: WHERE company_id = ?
 *   - Builder-scoped (and any row-scoped role): WHERE builder_id = ?
 *
 * The boolean flags on the model decide which column names exist:
 *   { companyIdColumn, builderIdColumn } — pass null if the table doesn't have
 *   the column (e.g. `company` table itself has no company_id).
 */
export function applyTenantScope(
  where = {},
  user,
  { companyIdColumn = "company_id", builderIdColumn = "builder_id" } = {},
) {
  if (!user || !user.role_name) return where;
  const scope = getRoleScope(user.role_name);
  if (scope === SCOPES.PLATFORM) return where;

  const patch = { ...where };
  if (scope === SCOPES.COMPANY) {
    if (companyIdColumn && user.company_id) patch[companyIdColumn] = user.company_id;
    return patch;
  }

  // Everyone else (builder, row-scoped, etc.) gets a builder filter at this
  // layer. Row-level scoping (assigned_to / supervisor_id) is layered on top
  // by applyRowScope below.
  if (builderIdColumn && user.builder_id) patch[builderIdColumn] = user.builder_id;
  return patch;
}

/**
 * Row-level scope filter. Adds the ownership / assignment predicates required
 * by the doc's Section 6 row-scoping rules. Call AFTER applyTenantScope.
 *
 *   moduleName: a value from MODULES — controls which assignment column the
 *               filter targets (leads → assigned_to, jobs → supervisor_id, …).
 *
 * Columns referenced are the column names on the *current query target*, e.g.
 * for a lead query pass { assignedToColumn: "assigned_to" }.
 */
export function applyRowScope(
  where = {},
  user,
  moduleName,
  columns = {},
) {
  if (!user || !user.role_name) return where;
  const scope = getRoleScope(user.role_name);
  if (scope === SCOPES.PLATFORM || scope === SCOPES.COMPANY || scope === SCOPES.BUILDER) {
    return where;
  }

  const userId = user.users_id || user.id;
  if (!userId) return where;

  const patch = { ...where };

  // Sales Executive — leads/opportunities/quotations assigned to them.
  if (user.role_name === ROLES.SALES_EXECUTIVE) {
    const col = columns.assignedToColumn || "assigned_to";
    patch[col] = userId;
    return patch;
  }

  // Site Supervisor — jobs where they're the named supervisor.
  if (user.role_name === ROLES.SITE_SUPERVISOR) {
    const col = columns.supervisorColumn || "supervisor_id";
    patch[col] = userId;
    return patch;
  }

  // Permits / Color Consultant / Draft Person — jobs explicitly assigned via
  // job_assignments (or whatever the join table is). The calling service is
  // expected to provide the join; we just provide an OR over assignedToColumn
  // when present, so the simple "you created it or it's assigned to you" case
  // still works.
  if (
    user.role_name === ROLES.PERMITS ||
    user.role_name === ROLES.COLOR_CONSULTANT ||
    user.role_name === ROLES.DRAFT_PERSON
  ) {
    const col = columns.assignedToColumn;
    if (col) patch[col] = userId;
    return patch;
  }

  // Agent — only leads/jobs they personally submitted or are the referrer of.
  if (user.role_name === ROLES.AGENT) {
    const col = columns.referrerColumn || columns.createdByColumn || "created_by";
    patch[col] = userId;
    return patch;
  }

  // Contact — only their own job. Caller passes contactIdColumn (e.g. on the
  // job: customer_contact_id = self).
  if (user.role_name === ROLES.CONTACT) {
    const col = columns.contactIdColumn;
    if (col) patch[col] = userId;
    return patch;
  }

  return patch;
}

/**
 * Convenience: build a complete where clause from scratch given a base where,
 * the user, and the module being queried. Combines tenant + row scope in one
 * call — most service-side queries should use this.
 */
export function buildScopedWhere(baseWhere, user, moduleName, columns = {}) {
  const tenantScoped = applyTenantScope(baseWhere, user, columns);
  return applyRowScope(tenantScoped, user, moduleName, columns);
}

/**
 * Sequelize compatibility helper: if the calling code already has an Op-based
 * where (e.g. { [Op.and]: [...] }), merge new conditions safely without
 * stomping existing keys.
 */
export function mergeWhere(a = {}, b = {}) {
  if (Object.keys(b).length === 0) return a;
  if (Object.keys(a).length === 0) return b;
  return { [Op.and]: [a, b] };
}
