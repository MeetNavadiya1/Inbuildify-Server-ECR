/**
 * P4 — Role management service.
 *
 * All operations are tenant-scoped: every function injects the caller's
 * company_id server-side so a Company Admin can only affect their own company.
 *
 * P6 guardrails are implemented inline:
 *   - System roles (is_system = true) cannot be deleted or renamed.
 *   - The last role in a company with ROLE_MANAGEMENT access cannot have that
 *     access removed (prevents the company from locking itself out).
 */

import { Op } from "sequelize";
import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";
import { MODULES, ACTIONS, MODULE_PERMISSIONS, ROLES, getManageableRoles } from "../../constants/rbac.js";
import { invalidateCompanyPermissionCache, getEffectivePermissionsForUser } from "../../helper/permissionResolver.helper.js";
import { getRoleNameById } from "../../helper/rbac.helper.js";
import { logActivity, compareAndLogUpdates } from "../../utils/activityLogger.js";
import { sampleDataSqlScope } from "../../config/database/models/postgre-models/sampleDataFlag.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Throw a structured HTTP error */
function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/** Resolve company_id + builder_id from the current user. */
function resolveScope(currentUser) {
  const companyId = currentUser?.company_id;
  const builderId = currentUser?.builder_id;
  const userId = currentUser?.users_id || currentUser?.id;
  if (!companyId) throw httpError(401, "Unauthorized: no company context.");
  return { companyId, builderId, userId };
}

// ─── FR-2 / Security: ensure the role belongs to this company ─────────────────
async function assertRoleBelongsToCompany(roleId, companyId, transaction) {
  const role = await db.Role.findOne({
    where: { role_id: roleId, company_id: companyId },
    transaction,
  });
  if (!role) throw httpError(403, "Forbidden: role not found in this company.");
  return role;
}

// ─── Hierarchy guard: caller can only manage roles they are allowed to create ──
/**
 * Checks that the caller's role appears in ROLE_CREATION_MATRIX as a parent of
 * the target role's name. Super Admin is exempt (can manage everything).
 *
 * @param {string} callerRoleName — e.g. "Builder"
 * @param {string} targetRoleId  — the UUID of the role being read/modified
 */
async function assertCallerCanManageTargetRole(callerRoleName, targetRoleId) {
  // Super Admin has unrestricted access
  if (callerRoleName === ROLES.SUPER_ADMIN) return;

  const targetRole = await db.Role.findByPk(targetRoleId);
  if (!targetRole) throw httpError(404, "Target role not found.");

  // Allow self-view if permitted
  if (targetRole.name === callerRoleName && targetRole.can_view_own_permissions) return;

  // Custom roles can be managed by anyone with ROLE_MANAGEMENT access in this scope
  if (!targetRole.is_system) return;

  const targetRoleName = targetRole.name;
  const manageable = getManageableRoles(callerRoleName);
  if (!manageable.includes(targetRoleName)) {
    throw httpError(
      403,
      `Forbidden: "${callerRoleName}" cannot manage permissions for "${targetRoleName}". ` +
      `You can only manage roles that appear below you in the hierarchy.`,
    );
  }
}

// ─── P6 Guardrail: self-lockout prevention ────────────────────────────────────
/**
 * Checks that, after applying `proposedChanges` to role `roleId`, at least one
 * active role in the company still grants can_update=true on ROLE_MANAGEMENT.
 *
 * proposedChanges: { [moduleName]: { can_create, can_read, can_update, can_delete } }
 * or null/undefined to check the current state only.
 */
async function assertRoleManagementNotLocked(companyId, roleId, proposedChanges, transaction) {
  // Find all active roles in the company
  const roles = await db.Role.findAll({
    where: { company_id: companyId, is_active: true },
    attributes: ["role_id"],
    transaction,
  });

  const roleIds = roles.map(r => r.role_id);
  if (roleIds.length === 0) return; // nothing to check

  // Fetch ROLE_MANAGEMENT permissions for all active company roles
  const perms = await db.RolePermission.findAll({
    where: {
      role_id: { [Op.in]: roleIds },
      company_id: companyId,
      module_name: MODULES.ROLE_MANAGEMENT,
      is_active: true,
    },
    attributes: ["role_id", "can_update"],
    transaction,
  });

  // Determine if at least one role (other than the one being changed) has update access
  for (const perm of perms) {
    if (perm.role_id === roleId) {
      // This is the role being changed — check against proposed value
      const proposed = proposedChanges?.[MODULES.ROLE_MANAGEMENT];
      if (proposed?.can_update === true) return; // proposed keeps access — OK
    } else {
      if (perm.can_update === true) return; // another role still has access — OK
    }
  }

  throw httpError(
    400,
    "Cannot remove ROLE_MANAGEMENT access: at least one active role must retain it (FR-7 guardrail)."
  );
}

// ─── Privilege-escalation guardrail ──────────────────────────────────────────
/**
 * Ensures the caller cannot grant a target role permissions they don't hold
 * themselves. Roles with full ROLE_MANAGEMENT authority (Company Admin variants
 * and Super Admin) are exempt — they already hold ALL permissions.
 *
 * proposedMap: { [moduleName]: { can_create, can_read, can_update, can_delete } }
 */
const ROLE_MANAGEMENT_ADMIN_ROLES = new Set([
  ROLES.SUPER_ADMIN,
  ROLES.COMPANY_ADMINISTRATOR,
  ROLES.MH_COMPANY_ADMIN,
  ROLES.MY_HOME_COMPANY_ADMIN,
  ROLES.MY_HOME_ADMIN,
]);

async function assertNoPrivilegeEscalation(currentUser, proposedMap) {
  if (ROLE_MANAGEMENT_ADMIN_ROLES.has(currentUser.role_name)) {
    return;
  }

  const callerPerms = await getEffectivePermissionsForUser(currentUser);

  const violations = [];
  for (const [moduleName, proposed] of Object.entries(proposedMap)) {
    const mine = callerPerms[moduleName] || {};
    if (proposed.can_create && !mine[ACTIONS.CREATE]) {
      violations.push(`${moduleName}:create`);
    }
    if (proposed.can_read && !mine[ACTIONS.READ]) {
      violations.push(`${moduleName}:read`);
    }
    if (proposed.can_update && !mine[ACTIONS.UPDATE]) {
      violations.push(`${moduleName}:update`);
    }
    if (proposed.can_delete && !mine[ACTIONS.DELETE]) {
      violations.push(`${moduleName}:delete`);
    }
  }

  if (violations.length > 0) {
    throw httpError(
      403,
      `Forbidden: cannot grant permissions you do not hold: ${violations.join(", ")}`,
    );
  }
}

// ─── Custom Role Visibility Helper ────────────────────────────────────────────

function canSeeCustomRole(roleRecord, currentUser, callerRoleName, manageable) {
  if (roleRecord.is_system) return true; // System roles are handled separately
  
  const currentUserId = currentUser?.users_id || currentUser?.id;

  // 1. Creator always sees their own roles
  if (roleRecord.created_by === currentUserId) return true;

  // 2. Company Admins see ALL custom roles
  const COMPANY_ADMIN_ROLES = [
    ROLES.COMPANY_ADMINISTRATOR,
    ROLES.MH_COMPANY_ADMIN,
    ROLES.MY_HOME_COMPANY_ADMIN,
    ROLES.MY_HOME_ADMIN,
  ];
  if (COMPANY_ADMIN_ROLES.includes(callerRoleName)) return true;

  // 3. Check creator's role
  const creatorRoleName = roleRecord.createdByUser?.role?.name;
  if (!creatorRoleName) return false;

  // Peers see each other's custom roles (e.g. Builder sees Builder-created roles)
  if (creatorRoleName === callerRoleName) return true;

  // Superiors see subordinates' custom roles
  if (manageable.includes(creatorRoleName)) return true;

  return false;
}

// ─── FR-3: List company roles ─────────────────────────────────────────────────

/**
 * GET /role — list all roles for the caller's company.
 * Returns system roles (seeded copies) + any custom roles created by the admin.
 */
export async function listCompanyRoles(currentUser) {
  const { companyId, builderId } = resolveScope(currentUser);
  const callerRoleName = currentUser?.role_name;

  const whereClause = {
    company_id: companyId,
    name: {
      [Op.notIn]: [
        ROLES.MH_COMPANY_ADMIN,
        ROLES.MY_HOME_COMPANY_ADMIN,
        ROLES.MY_HOME_ADMIN,
      ],
    },
  };
  if (builderId) {
    whereClause[Op.and] = [
      {
        [Op.or]: [
          { is_system: true },
          { builder_id: builderId }
        ]
      }
    ];
  }

  const roles = await db.Role.findAll({
    where: whereClause,
    include: [
      {
        model: db.Users,
        as: "createdByUser",
        attributes: ["role_id"],
        include: [
          {
            model: db.Role,
            as: "role",
            attributes: ["name"]
          }
        ]
      }
    ],
    order: [
      ["is_system", "DESC"], // system roles first
      ["name", "ASC"],
    ],
    attributes: [
      "role_id", "name", "description",
      "company_id", "builder_id",
      "is_system", "is_active",
      "can_view_own_permissions",
      "created_by", "updated_by",
      "createdAt", "updatedAt",
    ],
  });

  // ── Hierarchy filter ─────────────────────────────────────────────────────
  // Super Admin sees all roles. Every other role only sees roles that appear
  // in their ROLE_CREATION_MATRIX entry (i.e. roles they are allowed to manage).
  // Custom roles (!is_system) are visible to anyone who has access to this list.
  const manageable = getManageableRoles(callerRoleName);
  const isSuperAdmin = callerRoleName === ROLES.SUPER_ADMIN;

  const plainRoles = roles.map(r => r.get({ plain: true }));

  const filtered = isSuperAdmin
    ? plainRoles
    : plainRoles.filter(r => {
        // ALWAYS include the user's own role if they have self-view permission!
        if (r.name === callerRoleName && r.can_view_own_permissions) {
          return true;
        }

        if (r.is_system) {
          return manageable.includes(r.name);
        } else {
          return canSeeCustomRole(r, currentUser, callerRoleName, manageable);
        }
      });

  return keysToCamelCase(filtered);
}

/**
 * GET /role/assignable — minimal, NON-management reference list of the caller's
 * company roles (id + name), active only. Used to populate user-assignment
 * dropdowns for any authenticated company user (e.g. a Sales Manager creating a
 * sub-user) who does NOT have ROLE_MANAGEMENT. Unlike listCompanyRoles this is
 * not gated by ROLE_MANAGEMENT — it only exposes role identity within the
 * caller's own company, never permissions.
 */
export async function listAssignableRoles(currentUser) {
  const { companyId, builderId } = resolveScope(currentUser);
  const callerRoleName = currentUser?.role_name;
  const manageable = getManageableRoles(callerRoleName);

  const whereClause = {
    company_id: companyId,
    is_active: true,
    name: {
      [Op.notIn]: [
        ROLES.MH_COMPANY_ADMIN,
        ROLES.MY_HOME_COMPANY_ADMIN,
        ROLES.MY_HOME_ADMIN,
      ],
    },
  };
  if (builderId) {
    whereClause[Op.and] = [
      {
        [Op.or]: [
          { is_system: true },
          { builder_id: builderId }
        ]
      }
    ];
  }

  const roles = await db.Role.findAll({
    where: whereClause,
    include: [
      {
        model: db.Users,
        as: "createdByUser",
        attributes: ["role_id"],
        include: [
          {
            model: db.Role,
            as: "role",
            attributes: ["name"]
          }
        ]
      }
    ],
    order: [["name", "ASC"]],
    attributes: ["role_id", "name", "is_system", "is_active", "created_by"],
  });

  const isSuperAdmin = callerRoleName === ROLES.SUPER_ADMIN;
  const plainRoles = roles.map(r => r.get({ plain: true }));

  const filtered = isSuperAdmin
    ? plainRoles
    : plainRoles.filter(r => {
        if (r.is_system) {
          return true; // System roles filtered by frontend dropdown logic
        } else {
          return canSeeCustomRole(r, currentUser, callerRoleName, manageable);
        }
      });

  return keysToCamelCase(filtered);
}

// ─── FR-3: Create custom role ─────────────────────────────────────────────────

/**
 * POST /role — create a new custom (non-system) role scoped to the company.
 *
 * payload:
 *   name        string  (required)
 *   description string  (optional)
 *   clone_from  UUID    (optional — role_id to copy permissions from)
 */
export async function createCustomRole(currentUser, payload) {
  const { companyId, builderId, userId } = resolveScope(currentUser);
  const { name, description, clone_from } = payload;

  if (!name?.trim()) throw httpError(400, "Role name is required.");

  const transaction = await db.sequelize.transaction();
  try {
    // ── Uniqueness check within company ──────────────────────────────────────
    const companyDupe = await db.Role.findOne({
      where: {
        company_id: companyId,
        [Op.and]: db.sequelize.where(
          db.sequelize.fn("LOWER", db.sequelize.col("name")),
          name.trim().toLowerCase()
        ),
      },
      transaction,
    });
    if (companyDupe) throw httpError(409, `A role named "${name.trim()}" already exists in this company.`);

    // ── Create the role ───────────────────────────────────────────────────────
    const newRole = await db.Role.create({
      name: name.trim(),
      description: description?.trim() || null,
      company_id: companyId,
      builder_id: builderId || null,
      is_system: false,
      is_active: true,
      created_by: userId,
      updated_by: userId,
    }, { transaction });

    // ── Optional: clone permissions from an existing role ────────────────────
    if (clone_from) {
      // Verify the source role belongs to this company
      const sourceRole = await db.Role.findOne({
        where: { role_id: clone_from, company_id: companyId },
        transaction,
      });
      if (!sourceRole) throw httpError(400, "clone_from role not found in this company.");

      const sourcePerms = await db.RolePermission.findAll({
        where: { role_id: clone_from, company_id: companyId, is_active: true },
        transaction,
      });

      if (sourcePerms.length > 0) {
        const now = new Date();
        const permRows = sourcePerms.map(p => ({
          role_id: newRole.role_id,
          company_id: companyId,
          builder_id: builderId || null,
          module_name: p.module_name,
          can_create: p.can_create,
          can_read: p.can_read,
          can_update: p.can_update,
          can_delete: p.can_delete,
          is_active: true,
          created_by: userId,
          updated_by: userId,
          createdAt: now,
          updatedAt: now,
        }));
        await db.RolePermission.bulkCreate(permRows, {
          ignoreDuplicates: true,
          transaction,
        });
      }
    }
    // No clone — role starts with all-deny (no permission rows inserted)

    await logActivity(transaction, {
      userId,
      companyId,
      builderId,
      referenceId: newRole.role_id,
      referenceType: "ROLE",
      module: "Role & Permission",
      moduleId: newRole.role_id,
      recordName: name.trim(),
      action: "CREATE",
      description: `Created new role: ${name.trim()}${clone_from ? " (Cloned)" : ""}`,
    });

    await transaction.commit();
    return keysToCamelCase(newRole.get({ plain: true }));
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

// ─── FR-5: Update role (rename / activate / deactivate) ──────────────────────

/**
 * PATCH /role/:id — rename or toggle is_active.
 * System roles can be toggled (is_active) but NOT renamed.
 */
export async function updateRole(currentUser, roleId, payload) {
  const { companyId, userId } = resolveScope(currentUser);
  const { name, description, is_active } = payload;

  const transaction = await db.sequelize.transaction();
  try {
    const role = await assertRoleBelongsToCompany(roleId, companyId, transaction);

    // P6: system roles cannot be renamed
    if (name !== undefined && role.is_system) {
      throw httpError(400, "System roles cannot be renamed.");
    }

    // P6: guard against deactivating the last role with ROLE_MANAGEMENT access
    if (is_active === false) {
      // Simulate the "after" state: this role becomes inactive
      // Check that another active role still has ROLE_MANAGEMENT update
      const otherActiveWithRoleManagement = await db.RolePermission.findOne({
        where: {
          company_id: companyId,
          module_name: MODULES.ROLE_MANAGEMENT,
          can_update: true,
          is_active: true,
          role_id: { [Op.ne]: roleId },
        },
        include: [{
          model: db.Role,
          as: "role",
          where: { company_id: companyId, is_active: true, role_id: { [Op.ne]: roleId } },
          required: true,
        }],
        transaction,
      });

      if (!otherActiveWithRoleManagement) {
        throw httpError(
          400,
          "Cannot deactivate: this is the last active role with ROLE_MANAGEMENT access (FR-7 guardrail)."
        );
      }
    }

    // Check name uniqueness if renaming
    if (name !== undefined && name.trim().toLowerCase() !== role.name.toLowerCase()) {
      const dupe = await db.Role.findOne({
        where: {
          company_id: companyId,
          [Op.and]: db.sequelize.where(
            db.sequelize.fn("LOWER", db.sequelize.col("name")),
            name.trim().toLowerCase()
          ),
          role_id: { [Op.ne]: roleId },
        },
        transaction,
      });
      if (dupe) throw httpError(409, `A role named "${name.trim()}" already exists in this company.`);
    }

    const { can_view_own_permissions } = payload;

    const updateData = { updated_by: userId };
    if (name !== undefined && !role.is_system) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (is_active !== undefined) updateData.is_active = is_active;
    if (can_view_own_permissions !== undefined) updateData.can_view_own_permissions = can_view_own_permissions;

    const oldData = role.get({ plain: true });

    await role.update(updateData, { transaction });

    const newData = role.get({ plain: true });

    // Custom activity log for self view permissions toggle
    const old_can_view = String(oldData.can_view_own_permissions ?? false);
    const new_can_view = String(newData.can_view_own_permissions ?? false);

    if (can_view_own_permissions !== undefined && old_can_view !== new_can_view) {
      const actorName = currentUser.name || "Unknown user";
      const actorRole = currentUser.role_name || "";
      const actorLabel = actorRole ? `${actorName} (${actorRole})` : actorName;
      await logActivity(transaction, {
        userId,
        companyId,
        builderId: role.builder_id,
        referenceId: roleId,
        referenceType: "ROLE",
        module: "Role & Permission",
        moduleId: roleId,
        recordName: role.name,
        action: "UPDATE",
        fieldName: "can_view_own_permissions",
        oldValue: oldData.can_view_own_permissions ?? false,
        newValue: newData.can_view_own_permissions ?? false,
        description: newData.can_view_own_permissions
          ? `${actorLabel} turned Self view ON for the ${role.name} role`
          : `${actorLabel} turned Self view OFF for the ${role.name} role`,
        metadata: { actorName, actorRole, targetRole: role.name },
      });
    }

    await compareAndLogUpdates(transaction, {
      userId,
      companyId,
      builderId: role.builder_id,
      referenceId: roleId,
      referenceType: "ROLE",
      module: "Role & Permission",
      moduleId: roleId,
      recordName: role.name,
      oldData,
      newData,
      ignoreFields: ["can_view_own_permissions"],
    });

    await transaction.commit();

    // Invalidate permission cache for this company (role status change)
    invalidateCompanyPermissionCache(companyId);

    return keysToCamelCase(role.get({ plain: true }));
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

// ─── FR-5: Delete custom role ─────────────────────────────────────────────────

/**
 * DELETE /role/:id — delete a custom (non-system) role.
 * Blocked if:
 *   - is_system = true
 *   - any user is currently assigned to this role
 */
export async function deleteRole(currentUser, roleId) {
  const { companyId } = resolveScope(currentUser);

  const transaction = await db.sequelize.transaction();
  try {
    const role = await assertRoleBelongsToCompany(roleId, companyId, transaction);

    if (role.is_system) {
      throw httpError(400, "System roles cannot be deleted.");
    }

    // Check for assigned users
    const assignedUsers = await db.Users.count({
      where: { role_id: roleId },
      transaction,
    });
    if (assignedUsers > 0) {
      throw httpError(
        409,
        `Cannot delete: ${assignedUsers} user(s) are still assigned to this role. Reassign them first.`
      );
    }

    // Delete associated permissions first, then the role
    await db.RolePermission.destroy({
      where: { role_id: roleId, company_id: companyId },
      transaction,
    });
    await role.destroy({ transaction });

    await logActivity(transaction, {
      userId: currentUser.users_id,
      companyId,
      builderId: currentUser.builder_id,
      referenceId: roleId,
      referenceType: "ROLE",
      module: "Role & Permission",
      moduleId: roleId,
      recordName: role.name,
      action: "DELETE",
      description: `Deleted role: ${role.name}`,
    });

    await transaction.commit();

    invalidateCompanyPermissionCache(companyId);
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

// ─── FR-4: Get role's full permission matrix ──────────────────────────────────

/**
 * GET /role/:id/permissions — return the full module CRUD matrix for a role.
 *
 * Merges DB rows with the static matrix so every module always appears, even
 * if no DB row exists yet (code fallback shows the effective default).
 */
export async function getRolePermissions(currentUser, roleId, skipHierarchyCheck = false) {
  const { companyId } = resolveScope(currentUser);
  const callerRoleName = currentUser?.role_name;

  await assertRoleBelongsToCompany(roleId, companyId);
  
  // Hierarchy guard: caller can only inspect roles they are allowed to manage.
  if (!skipHierarchyCheck) {
    await assertCallerCanManageTargetRole(callerRoleName, roleId);
  }

  // Fetch this role's DB permission rows (company-scoped)
  const dbRows = await db.RolePermission.findAll({
    where: { role_id: roleId, company_id: companyId, is_active: true },
    attributes: ["module_name", "can_create", "can_read", "can_update", "can_delete"],
    raw: true,
  });

  const dbMap = new Map(dbRows.map(r => [r.module_name, r]));

  // Fetch the role's name so we can use the static matrix as fallback
  const role = await db.Role.findByPk(roleId, { attributes: ["name"] });
  const staticPerms = role ? (MODULE_PERMISSIONS[role.name] ?? {}) : {};

  // Build the full matrix across all MODULES
  const matrix = {};
  for (const [, moduleName] of Object.entries(MODULES)) {
    if (dbMap.has(moduleName)) {
      const row = dbMap.get(moduleName);
      matrix[moduleName] = {
        can_create: row.can_create,
        can_read: row.can_read,
        can_update: row.can_update,
        can_delete: row.can_delete,
        source: "db",
      };
    } else if (staticPerms[moduleName]) {
      const s = staticPerms[moduleName];
      matrix[moduleName] = {
        can_create: s[ACTIONS.CREATE] ?? false,
        can_read: s[ACTIONS.READ] ?? false,
        can_update: s[ACTIONS.UPDATE] ?? false,
        can_delete: s[ACTIONS.DELETE] ?? false,
        source: "static_fallback",
      };
    } else {
      matrix[moduleName] = {
        can_create: false,
        can_read: false,
        can_update: false,
        can_delete: false,
        source: "default_deny",
      };
    }
  }

  return {
    role_id: roleId,
    permissions: matrix,
  };
}

// ─── FR-4: Bulk upsert role permissions ──────────────────────────────────────

/**
 * PUT /role/:id/permissions — bulk upsert the module CRUD matrix.
 *
 * permissions: Array of { module_name, can_create, can_read, can_update, can_delete }
 *
 * This is idempotent: calling it twice with the same payload has no net effect.
 * Only rows for modules listed in the MODULES registry are accepted.
 * After a successful save the permission cache is invalidated for this company.
 */
export async function upsertRolePermissions(currentUser, roleId, permissions) {
  const { companyId, builderId, userId } = resolveScope(currentUser);
  const callerRoleName = currentUser?.role_name;

  if (!Array.isArray(permissions) || permissions.length === 0) {
    throw httpError(400, "permissions must be a non-empty array.");
  }

  // Validate that every module_name is a known MODULES value
  const validModules = new Set(Object.values(MODULES));
  const unknownModules = permissions
    .map(p => p.module_name)
    .filter(m => !validModules.has(m));
  if (unknownModules.length > 0) {
    throw httpError(400, `Unknown module names: ${unknownModules.join(", ")}`);
  }

  // Hierarchy guard — run BEFORE opening a transaction so we fail fast.
  // Caller can only modify permissions for roles they are allowed to create.
  await assertCallerCanManageTargetRole(callerRoleName, roleId);

  const transaction = await db.sequelize.transaction();
  try {
    await assertRoleBelongsToCompany(roleId, companyId, transaction);

    // P6: Self-lockout guardrail
    // Build a map of the proposed changes keyed by module name
    const proposedMap = {};
    for (const p of permissions) {
      proposedMap[p.module_name] = p;
    }
    await assertRoleManagementNotLocked(companyId, roleId, proposedMap, transaction);
    await assertNoPrivilegeEscalation(currentUser, proposedMap);

    const existingPerms = await db.RolePermission.findAll({
      where: { role_id: roleId, company_id: companyId },
      transaction,
    });
    const existingMap = new Map();
    for (const p of existingPerms) {
      existingMap.set(p.module_name, p);
    }

    const now = new Date();
    const diffs = [];

    for (const perm of permissions) {
      const {
        module_name,
        can_create = false,
        can_read = false,
        can_update = false,
        can_delete = false,
      } = perm;

      const existing = existingMap.get(module_name);
      
      const isChanged = !existing || 
        existing.can_create !== can_create ||
        existing.can_read !== can_read ||
        existing.can_update !== can_update ||
        existing.can_delete !== can_delete;

      if (isChanged) {
        const changes = [];
        if (!existing || existing.can_create !== can_create) changes.push(`Create: ${can_create ? 'On' : 'Off'}`);
        if (!existing || existing.can_read !== can_read) changes.push(`Read: ${can_read ? 'On' : 'Off'}`);
        if (!existing || existing.can_update !== can_update) changes.push(`Update: ${can_update ? 'On' : 'Off'}`);
        if (!existing || existing.can_delete !== can_delete) changes.push(`Delete: ${can_delete ? 'On' : 'Off'}`);
        
        diffs.push(`${module_name} (${changes.join(', ')})`);
      }

      // Try to update existing row first
      const [updatedCount] = await db.RolePermission.update(
        {
          can_create,
          can_read,
          can_update,
          can_delete,
          is_active: true,
          updated_by: userId,
          updatedAt: now,
        },
        {
          where: { role_id: roleId, company_id: companyId, module_name },
          transaction,
        }
      );

      if (updatedCount === 0) {
        // Row doesn't exist yet — insert
        await db.RolePermission.create(
          {
            role_id: roleId,
            company_id: companyId,
            builder_id: builderId || null,
            module_name,
            can_create,
            can_read,
            can_update,
            can_delete,
            is_active: true,
            created_by: userId,
            updated_by: userId,
          },
          { transaction }
        );
      }
    }

    // Only log if something actually changed!
    if (diffs.length > 0) {
      const roleData = await db.Role.findOne({ where: { role_id: roleId }, transaction, attributes: ['name'] });
      
      let descriptionStr = `${currentUser?.name || 'A user'} updated permissions for the "${roleData?.name || 'Unknown'}" role. Changes: `;
      if (diffs.length <= 3) {
        descriptionStr += diffs.join('; ');
      } else {
        descriptionStr += `${diffs.slice(0, 3).join('; ')}... and ${diffs.length - 3} more`;
      }

      await logActivity(transaction, {
        userId,
        companyId,
        builderId,
        referenceId: roleId,
        referenceType: "ROLE",
        module: "Role & Permission",
        moduleId: roleId,
        recordName: roleData?.name || "Role",
        action: "UPDATE",
        description: descriptionStr,
      });
    }

    await transaction.commit();

    // Invalidate the in-memory cache so the change takes effect on the next request
    invalidateCompanyPermissionCache(companyId);

    return { role_id: roleId, updated: permissions.length };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

// ─── View own permissions ─────────────────────────────────────────────────────

/**
 * GET /role/my-permissions
 *
 * Returns the caller's own role's effective permission matrix without requiring
 * ROLE_MANAGEMENT access. The role must have can_view_own_permissions = true;
 * Company Administrators control that flag via PATCH /role/:id.
 *
 * Response shape is identical to GET /role/:id/permissions so the frontend can
 * reuse the same component for read-only display.
 */
export async function getMyPermissions(currentUser) {
  const { companyId } = resolveScope(currentUser);
  const roleId = currentUser.role_id;
  if (!roleId) throw httpError(401, "No role assigned to your account.");

  const role = await db.Role.findOne({
    where: { role_id: roleId, company_id: companyId },
    attributes: ["role_id", "name", "can_view_own_permissions"],
  });
  if (!role) throw httpError(403, "Your role was not found in this company.");
  if (!role.can_view_own_permissions) {
    throw httpError(403, "Your role is not permitted to view its own permissions. Contact your Company Administrator.");
  }

  // Reuse getRolePermissions logic for the caller's own role_id, skipping hierarchy check.
  return getRolePermissions(currentUser, roleId, true);
}

// ─── Role Activity Logs ───────────────────────────────────────────────────────

/**
 * GET /role/:id/activities — Fetch activity logs for a specific role.
 */
export async function getRoleActivityLog(currentUser, roleId, filters) {
  const { companyId, builderId, userId } = resolveScope(currentUser);

  await assertRoleBelongsToCompany(roleId, companyId);

  const { page = 1, limit = 20, search } = filters;
  const offset = (page - 1) * limit;

  const replacements = { roleId, companyId, limit, offset };
  let whereClause = "al.reference_id = :roleId AND al.reference_type = 'ROLE' AND al.company_id = :companyId";

  if (builderId) {
    whereClause += " AND (al.builder_id = :builderId OR al.user_id = :userId)";
    replacements.builderId = builderId;
    replacements.userId = userId;
  }

  if (currentUser.role_name !== ROLES.SUPER_ADMIN) {
    const allowedActorRoles = [...getManageableRoles(currentUser.role_name), currentUser.role_name];
    whereClause += " AND (al.user_id IS NULL OR r.name IN (:allowedActorRoles))";
    replacements.allowedActorRoles = allowedActorRoles;
  }

  if (search) {
    whereClause += " AND (u.name ILIKE :search OR al.description ILIKE :search OR al.record_name ILIKE :search)";
    replacements.search = `%${search}%`;
  }

  // Seeded timeline entries belong to whoever imported them, so a colleague's
  // copy is not replayed here alongside the caller's own.
  const sampleScope = sampleDataSqlScope("al");
  if (sampleScope.sql) {
    whereClause += ` AND ${sampleScope.sql}`;
    Object.assign(replacements, sampleScope.replacements);
  }

  const logs = await db.sequelize.query(
    `SELECT al.*, u.name AS user_name FROM activity_logs al LEFT JOIN users u ON al.user_id = u.users_id LEFT JOIN role r ON u.role_id = r.role_id WHERE ${whereClause} ORDER BY al.created_at DESC LIMIT :limit OFFSET :offset`,
    { replacements, type: db.sequelize.QueryTypes.SELECT }
  );

  const countResult = await db.sequelize.query(
    `SELECT COUNT(*)::int AS total FROM activity_logs al LEFT JOIN users u ON al.user_id = u.users_id LEFT JOIN role r ON u.role_id = r.role_id WHERE ${whereClause}`,
    { replacements, type: db.sequelize.QueryTypes.SELECT }
  );
  const total = countResult[0].total;

  const activityLogs = keysToCamelCase(logs);

  return {
    success: true,
    data: {
      activityLogs,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    },
    message: "Role activity log fetched successfully"
  };
}

/**
 * GET /role/activities — Fetch consolidated activity logs for all roles in the caller's hierarchy.
 */
export async function getAllRoleActivities(currentUser, filters) {
  const { companyId, builderId, userId } = resolveScope(currentUser);

  // 1. Get all roles the caller is allowed to see in the UI
  const visibleRoles = await listCompanyRoles(currentUser);
  const visibleRoleIds = visibleRoles.map(r => r.roleId);

  // Fallback if somehow empty, though usually it includes at least one
  if (visibleRoleIds.length === 0) {
    return {
      success: true,
      data: { activityLogs: [], pagination: { page: 1, limit: filters.limit || 20, total: 0, totalPages: 0 } },
      message: "Role activity log fetched successfully"
    };
  }

  const { page = 1, limit = 20, search } = filters;
  const offset = (page - 1) * limit;

  // 2. Query activity_logs where it's a ROLE log and it involves a visible role
  const replacements = { visibleRoleIds, companyId, limit, offset };
  let whereClause = "al.reference_type = 'ROLE' AND al.company_id = :companyId AND al.reference_id IN (:visibleRoleIds)";

  // 3. Filter by actor: If user is a builder, ONLY show logs generated by their own branch
  if (builderId) {
    whereClause += " AND (al.builder_id = :builderId OR al.user_id = :userId)";
    replacements.builderId = builderId;
    replacements.userId = userId;
  }

  // 4. Hierarchy filter for actors
  if (currentUser.role_name !== ROLES.SUPER_ADMIN) {
    const allowedActorRoles = [...getManageableRoles(currentUser.role_name), currentUser.role_name];
    whereClause += " AND (al.user_id IS NULL OR r.name IN (:allowedActorRoles))";
    replacements.allowedActorRoles = allowedActorRoles;
  }

  if (search) {
    whereClause += " AND (u.name ILIKE :search OR al.description ILIKE :search OR al.record_name ILIKE :search)";
    replacements.search = `%${search}%`;
  }

  // Seeded timeline entries belong to whoever imported them, so a colleague's
  // copy is not replayed here alongside the caller's own.
  const sampleScope = sampleDataSqlScope("al");
  if (sampleScope.sql) {
    whereClause += ` AND ${sampleScope.sql}`;
    Object.assign(replacements, sampleScope.replacements);
  }

  const logs = await db.sequelize.query(
    `SELECT al.*, u.name AS user_name FROM activity_logs al LEFT JOIN users u ON al.user_id = u.users_id LEFT JOIN role r ON u.role_id = r.role_id WHERE ${whereClause} ORDER BY al.created_at DESC LIMIT :limit OFFSET :offset`,
    { replacements, type: db.sequelize.QueryTypes.SELECT }
  );

  const countResult = await db.sequelize.query(
    `SELECT COUNT(*)::int AS total FROM activity_logs al LEFT JOIN users u ON al.user_id = u.users_id LEFT JOIN role r ON u.role_id = r.role_id WHERE ${whereClause}`,
    { replacements, type: db.sequelize.QueryTypes.SELECT }
  );
  const total = countResult[0].total;

  const activityLogs = keysToCamelCase(logs);

  return {
    success: true,
    data: {
      activityLogs,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    },
    message: "Global role activity log fetched successfully"
  };
}

export default {
  listCompanyRoles,
  listAssignableRoles,
  createCustomRole,
  updateRole,
  deleteRole,
  getRolePermissions,
  getMyPermissions,
  upsertRolePermissions,
  getRoleActivityLog,
  getAllRoleActivities,
};
