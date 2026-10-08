/**
 * Migration: add can_view_own_permissions to role table.
 *
 * Two changes in one migration:
 *   1. New boolean column `can_view_own_permissions` (default false) on `role`.
 *      When true, users of that role can hit GET /role/my-permissions to read
 *      their own effective permission map without needing ROLE_MANAGEMENT.
 *      Only Company Administrators can toggle this flag via PATCH /role/:id.
 *
 *   2. Strip ROLE_MANAGEMENT permissions from Builder rows in role_permission.
 *      The static matrix was updated to remove Builder from ROLE_MANAGEMENT;
 *      this clears any previously-seeded DB rows so the DB matches the intent.
 *      Company Admins can re-grant ROLE_MANAGEMENT to Builder temporarily via
 *      the PUT /role/:id/permissions API (delegation flow).
 */

"use strict";

export async function up(queryInterface, Sequelize) {
  // 1. Add the column (guard against re-runs where it already exists)
  const tableDesc = await queryInterface.describeTable("role");
  if (!tableDesc.can_view_own_permissions) {
    await queryInterface.addColumn("role", "can_view_own_permissions", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  }

  // 2. Strip ROLE_MANAGEMENT from Builder roles in role_permission.
  //    Targets:
  //      a) Global template rows (company_id IS NULL) for the Builder role.
  //      b) Per-company rows cloned from those templates.
  await queryInterface.sequelize.query(`
    UPDATE role_permission rp
    SET can_create = FALSE,
        can_read   = FALSE,
        can_update = FALSE,
        can_delete = FALSE,
        updated_at = NOW()
    FROM role r
    WHERE rp.role_id    = r.role_id
      AND r.name        = 'Builder'
      AND rp.module_name = 'role_management'
  `);
}

export async function down(queryInterface) {
  // Remove the column (permissions are NOT restored on rollback — the column
  // removal is the only safe inverse; re-granting Builder ROLE_MANAGEMENT must
  // be done explicitly if needed).
  await queryInterface.removeColumn("role", "can_view_own_permissions");
}
