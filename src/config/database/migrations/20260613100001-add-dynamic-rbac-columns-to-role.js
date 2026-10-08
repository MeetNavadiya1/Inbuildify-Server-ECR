"use strict";

/**
 * P1 — Add dynamic RBAC columns to the `role` table.
 *
 * Adds:
 *   company_id  UUID nullable  — owning company (NULL = global/system role)
 *   builder_id  UUID nullable  — optional builder scope
 *   is_system   boolean        — true for the 20 predefined roles; blocks delete/rename
 *   is_active   boolean        — soft enable/disable
 *
 * Also:
 *   - Adds a unique index on (LOWER(name), company_id) scoped per company.
 *   - Back-fills is_system = true for all existing seeded roles so the UI can
 *     distinguish them from custom roles created via the Settings editor.
 */

export async function up(queryInterface, Sequelize) {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    // ── 1. Add new columns (IF NOT EXISTS — idempotent) ──────────────────────
    await queryInterface.sequelize.query(
      `ALTER TABLE "public"."role" ADD COLUMN IF NOT EXISTS "company_id" UUID DEFAULT NULL`,
      { transaction }
    );

    await queryInterface.sequelize.query(
      `ALTER TABLE "public"."role" ADD COLUMN IF NOT EXISTS "builder_id" UUID DEFAULT NULL`,
      { transaction }
    );

    await queryInterface.sequelize.query(
      `ALTER TABLE "public"."role" ADD COLUMN IF NOT EXISTS "is_system" BOOLEAN NOT NULL DEFAULT FALSE`,
      { transaction }
    );

    await queryInterface.sequelize.query(
      `ALTER TABLE "public"."role" ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT TRUE`,
      { transaction }
    );

    // ── 2. Back-fill: mark all currently seeded roles as system roles ─────────
    await queryInterface.sequelize.query(
      `UPDATE role SET is_system = TRUE WHERE company_id IS NULL`,
      { transaction }
    );

    // ── 3. Unique index on (LOWER(name), company_id) ─────────────────────────
    await queryInterface.sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uix_role_name_company
       ON role (LOWER(name), company_id)
       WHERE company_id IS NOT NULL`,
      { transaction }
    );

    // ── 4. Deduplicate global roles (company_id IS NULL) ─────────────────────
    const [globalDuplicates] = await queryInterface.sequelize.query(`
      SELECT LOWER(name) AS lname, COUNT(*) AS cnt
      FROM role
      WHERE company_id IS NULL
      GROUP BY LOWER(name)
      HAVING COUNT(*) > 1
    `, { transaction });

    if (globalDuplicates.length > 0) {
      for (const dup of globalDuplicates) {
        const { lname } = dup;
        const [rows] = await queryInterface.sequelize.query(`
          SELECT r.role_id
          FROM role r
          WHERE r.company_id IS NULL AND LOWER(r.name) = :lname
          ORDER BY r.created_at ASC
        `, { replacements: { lname }, transaction });

        const [winner, ...losers] = rows;
        for (const loser of losers) {
          // Re-assign users
          await queryInterface.sequelize.query(`
            UPDATE users SET role_id = :winner_id WHERE role_id = :loser_id
          `, { replacements: { winner_id: winner.role_id, loser_id: loser.role_id }, transaction });
          // Delete role_permissions
          await queryInterface.sequelize.query(`
            DELETE FROM role_permission WHERE role_id = :loser_id
          `, { replacements: { loser_id: loser.role_id }, transaction });
          // Delete role
          await queryInterface.sequelize.query(`
            DELETE FROM role WHERE role_id = :loser_id
          `, { replacements: { loser_id: loser.role_id }, transaction });
        }
      }
    }
    // Safely rename any existing duplicate global roles so the unique index creation doesn't crash on dirty databases
    await queryInterface.sequelize.query(
      `UPDATE role
       SET name = name || ' (duplicate ' || substr(role_id::text, 1, 8) || ')'
       WHERE role_id IN (
           SELECT role_id
           FROM (
               SELECT role_id,
                      ROW_NUMBER() OVER (PARTITION BY LOWER(name) ORDER BY created_at ASC) as rnum
               FROM role
               WHERE company_id IS NULL
           ) t
           WHERE t.rnum > 1
       )`,
      { transaction }
    );

    // Separate index for global roles (company_id IS NULL)
    await queryInterface.sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uix_role_name_global
       ON role (LOWER(name))
       WHERE company_id IS NULL`,
      { transaction }
    );

    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

export async function down(queryInterface) {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS uix_role_name_company`,
      { transaction }
    );
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS uix_role_name_global`,
      { transaction }
    );
    await queryInterface.removeColumn("role", "is_active", { transaction });
    await queryInterface.removeColumn("role", "is_system", { transaction });
    await queryInterface.removeColumn("role", "builder_id", { transaction });
    await queryInterface.removeColumn("role", "company_id", { transaction });
    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}
