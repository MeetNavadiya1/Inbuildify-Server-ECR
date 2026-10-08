"use strict";

/**
 * Grant ALL CRUD permissions to Company Administrator and its variants
 * across every module in the system.
 *
 * Works correctly for:
 *  - New databases: updates global (NULL/NULL) role rows seeded by the
 *    earlier 20260528130000 migration.
 *  - Existing databases: updates BOTH global rows AND all per-company copies
 *    that were cloned during company sign-up.
 *  - Databases where dynamic RBAC columns (company_id, builder_id) have NOT
 *    yet been added to the role table — treats all roles as global in that case.
 *
 * Idempotent — safe to run multiple times.
 */

import { MODULES, ROLES } from "../../../constants/rbac.js";

const COMPANY_ADMIN_ROLE_NAMES = [
  ROLES.COMPANY_ADMINISTRATOR,
  ROLES.MH_COMPANY_ADMIN,
  ROLES.MY_HOME_COMPANY_ADMIN,
  ROLES.MY_HOME_ADMIN,
];

const ALL_MODULE_NAMES = Object.values(MODULES);

export async function up(queryInterface) {
  const { sequelize } = queryInterface;
  const now = new Date();

  // ── Detect which columns exist on the role table ──────────────────────────
  // On databases that haven't run the dynamic-RBAC migration yet
  // (20260613100001-add-dynamic-rbac-columns-to-role), company_id and
  // builder_id don't exist. We adapt the SELECT and treat those roles as
  // global (NULL/NULL).
  const roleColumns = await queryInterface.describeTable("role");
  const roleHasCompanyId = !!roleColumns.company_id;
  const roleHasBuilderIdCol = !!roleColumns.builder_id;

  // ── Detect which columns exist on role_permission ─────────────────────────
  const rpTableExists = await queryInterface.tableExists("role_permission");
  if (!rpTableExists) {
    console.log(
      "[migration 20260630200000] role_permission table does not exist yet. Skipping.",
    );
    return;
  }

  const rpColumns = await queryInterface.describeTable("role_permission");
  const rpHasCompanyId = !!rpColumns.company_id;
  const rpHasBuilderIdCol = !!rpColumns.builder_id;

  // ── Load Company Admin role rows ──────────────────────────────────────────
  let roles;
  if (roleHasCompanyId && roleHasBuilderIdCol) {
    const [rows] = await sequelize.query(
      `SELECT role_id, name, company_id, builder_id
       FROM role
       WHERE name IN (:names)`,
      { replacements: { names: COMPANY_ADMIN_ROLE_NAMES } },
    );
    roles = rows;
  } else {
    // Pre-dynamic-RBAC: select only the columns that exist
    const [rows] = await sequelize.query(
      `SELECT role_id, name
       FROM role
       WHERE name IN (:names)`,
      { replacements: { names: COMPANY_ADMIN_ROLE_NAMES } },
    );
    roles = rows.map((r) => ({ ...r, company_id: null, builder_id: null }));
  }

  if (roles.length === 0) {
    console.log(
      "[migration 20260630200000] No Company Admin roles found — " +
        "run the RBAC seed migration first. Skipping.",
    );
    return;
  }

  let updated = 0;
  let inserted = 0;

  for (const role of roles) {
    const companyId = role.company_id || null;
    const builderId = role.builder_id || null;

    for (const moduleName of ALL_MODULE_NAMES) {
      // Build WHERE clause dynamically based on available columns
      let whereClause = "role_id = :role_id AND module_name = :module_name";
      const replacements = {
        role_id: role.role_id,
        module_name: moduleName,
        now,
      };

      if (rpHasCompanyId) {
        whereClause += " AND company_id IS NOT DISTINCT FROM :company_id";
        replacements.company_id = companyId;
      }
      if (rpHasBuilderIdCol) {
        whereClause += " AND builder_id IS NOT DISTINCT FROM :builder_id";
        replacements.builder_id = builderId;
      }

      const [existing] = await sequelize.query(
        `SELECT role_permission_id FROM role_permission
         WHERE ${whereClause}
         LIMIT 1`,
        { replacements },
      );

      if (existing.length > 0) {
        await sequelize.query(
          `UPDATE role_permission
           SET can_create = TRUE,
               can_read   = TRUE,
               can_update = TRUE,
               can_delete = TRUE,
               is_active  = TRUE,
               updated_at = :now
           WHERE role_permission_id = :id`,
          { replacements: { id: existing[0].role_permission_id, now } },
        );
        updated++;
      } else {
        // Build INSERT dynamically too
        const insertCols = [
          "role_permission_id",
          "role_id",
          "module_name",
          "can_create",
          "can_read",
          "can_update",
          "can_delete",
          "is_active",
          "created_at",
          "updated_at",
        ];
        const insertVals = [
          "gen_random_uuid()",
          ":role_id",
          ":module_name",
          "TRUE",
          "TRUE",
          "TRUE",
          "TRUE",
          "TRUE",
          ":now",
          ":now",
        ];
        const insertReplacements = {
          role_id: role.role_id,
          module_name: moduleName,
          now,
        };

        if (rpHasCompanyId) {
          insertCols.splice(2, 0, "company_id");
          insertVals.splice(2, 0, ":company_id");
          insertReplacements.company_id = companyId;
        }
        if (rpHasBuilderIdCol) {
          insertCols.splice(rpHasCompanyId ? 3 : 2, 0, "builder_id");
          insertVals.splice(rpHasCompanyId ? 3 : 2, 0, ":builder_id");
          insertReplacements.builder_id = builderId;
        }

        await sequelize.query(
          `INSERT INTO role_permission (${insertCols.join(", ")})
           VALUES (${insertVals.join(", ")})`,
          { replacements: insertReplacements },
        );
        inserted++;
      }
    }
  }

  console.log(
    "[migration 20260630200000] Company Admin ALL-permissions grant complete. " +
      `Roles processed: ${roles.length}. ` +
      `Rows updated: ${updated}, inserted: ${inserted}.`,
  );
}

export async function down(_queryInterface) {
  console.log(
    "[migration 20260630200000] down: no-op. Re-run the RBAC seed migration " +
      "to restore original permissions.",
  );
}
