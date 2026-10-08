"use strict";

/**
 * Seed the 20 RBAC roles and their global (company_id = NULL, builder_id = NULL)
 * role_permission rows from the design doc. Global rows are the platform-wide
 * baseline; per-company / per-builder overrides — when needed — are inserted
 * later from the Role Management UI.
 *
 * Idempotent: re-running matches by (name) for roles and by
 * (role_id, module_name) with NULL company_id/builder_id for permissions, then
 * either UPDATEs the existing row or INSERTs. This avoids relying on a unique
 * index, since role.name isn't declared UNIQUE and the role_permission unique
 * index treats NULLs as distinct under default Postgres semantics.
 */

import { ROLES, MODULE_PERMISSIONS } from "../../../constants/rbac.js";

export async function up(queryInterface) {
  const sequelize = queryInterface.sequelize;
  const now = new Date();

  // ─── 1. Upsert the 20 roles ────────────────────────────────────────────────
  const roleNames = Object.values(ROLES);
  for (const name of roleNames) {
    const [existing] = await sequelize.query(
      `SELECT role_id FROM role WHERE name = :name LIMIT 1`,
      { replacements: { name } },
    );
    if (existing.length === 0) {
      await sequelize.query(
        `INSERT INTO role (role_id, name, description, created_at, updated_at)
         VALUES (gen_random_uuid(), :name, :description, :now, :now)`,
        {
          replacements: { name, description: `System role: ${name}`, now },
        },
      );
    }
  }

  // ─── 2. Lookup role_id by name ─────────────────────────────────────────────
  const [rows] = await sequelize.query(
    `SELECT role_id, name FROM role WHERE name IN (:names)`,
    { replacements: { names: roleNames } },
  );
  const idByName = new Map(rows.map((r) => [r.name, r.role_id]));

  // ─── 3. Upsert role_permission rows for the global (NULL/NULL) tenant ─────
  for (const [roleName, modulePerms] of Object.entries(MODULE_PERMISSIONS)) {
    const roleId = idByName.get(roleName);
    if (!roleId) continue;

    for (const [moduleName, actions] of Object.entries(modulePerms)) {
      const [found] = await sequelize.query(
        `SELECT role_permission_id FROM role_permission
         WHERE role_id = :role_id AND module_name = :module_name
           AND company_id IS NULL AND builder_id IS NULL
         LIMIT 1`,
        { replacements: { role_id: roleId, module_name: moduleName } },
      );

      if (found.length > 0) {
        await sequelize.query(
          `UPDATE role_permission SET
             can_create = :can_create,
             can_read   = :can_read,
             can_update = :can_update,
             can_delete = :can_delete,
             is_active  = TRUE,
             updated_at = :now
           WHERE role_permission_id = :id`,
          {
            replacements: {
              id: found[0].role_permission_id,
              can_create: !!actions.create,
              can_read: !!actions.read,
              can_update: !!actions.update,
              can_delete: !!actions.delete,
              now,
            },
          },
        );
      } else {
        await sequelize.query(
          `INSERT INTO role_permission
             (role_permission_id, role_id, company_id, builder_id, module_name,
              can_create, can_read, can_update, can_delete, is_active,
              created_at, updated_at)
           VALUES
             (gen_random_uuid(), :role_id, NULL, NULL, :module_name,
              :can_create, :can_read, :can_update, :can_delete, TRUE,
              :now, :now)`,
          {
            replacements: {
              role_id: roleId,
              module_name: moduleName,
              can_create: !!actions.create,
              can_read: !!actions.read,
              can_update: !!actions.update,
              can_delete: !!actions.delete,
              now,
            },
          },
        );
      }
    }
  }
}

export async function down(queryInterface) {
  // Conservative rollback: delete only the GLOBAL (NULL/NULL) rows we inserted.
  // Per-company / per-builder overrides created via the UI are kept untouched.
  // Roles themselves are kept; deleting them would orphan users.
  const sequelize = queryInterface.sequelize;
  await sequelize.query(
    `DELETE FROM role_permission WHERE company_id IS NULL AND builder_id IS NULL`,
  );
}
