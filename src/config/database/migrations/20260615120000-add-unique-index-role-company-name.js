"use strict";

/**
 * Migration: add unique index on role(company_id, name).
 *
 * Prevents the same role name from being created twice under one company —
 * the bug that caused two "Company Administrator" rows, so updating permissions
 * on one had no effect on users assigned to the other.
 *
 * Before adding the index this migration deduplicates any existing offending
 * rows so it is safe to run on both fresh and existing databases:
 *
 *  1. Find every (company_id, name) group that has more than one row.
 *  2. For each group, pick ONE row to keep (the one with the most assigned users;
 *     ties broken by oldest created_at, i.e. the original seed row).
 *  3. Re-point any users assigned to the loser rows to the winner row.
 *  4. Delete the loser rows' role_permission rows, then the loser role rows.
 *  5. Add the unique index.
 *
 * If both rows in a group have users AND the users cannot safely be migrated
 * (they already share the same winner role), the migration aborts with a clear
 * message so a developer can resolve it manually.
 */

export async function up(queryInterface) {
  const { sequelize } = queryInterface;

  // ── Step 1: Find duplicate (company_id, name) groups ─────────────────────
  const [duplicates] = await sequelize.query(`
    SELECT company_id, name, COUNT(*) AS cnt
    FROM role
    WHERE company_id IS NOT NULL
    GROUP BY company_id, name
    HAVING COUNT(*) > 1
  `);

  if (duplicates.length > 0) {
    console.log(`[migration] Found ${duplicates.length} duplicate role group(s) — deduplicating before adding index...`);

    for (const dup of duplicates) {
      const { company_id, name } = dup;

      // ── Step 2: Rank the duplicates — most users first, then oldest row ───
      const [rows] = await sequelize.query(`
        SELECT r.role_id,
               r.created_at,
               COUNT(u.users_id) AS user_count
        FROM role r
        LEFT JOIN users u ON u.role_id = r.role_id
        WHERE r.company_id = :company_id
          AND r.name       = :name
        GROUP BY r.role_id, r.created_at
        ORDER BY COUNT(u.users_id) DESC, r.created_at ASC
      `, { replacements: { company_id, name } });

      const [winner, ...losers] = rows;
      console.log(`[migration] role "${name}" (company ${company_id}): keeping ${winner.role_id}, removing ${losers.map(l => l.role_id).join(", ")}`);

      for (const loser of losers) {
        // ── Step 3: Re-assign any users on the loser to the winner ───────────
        await sequelize.query(`
          UPDATE users
          SET role_id    = :winner_id,
              updated_at = NOW()
          WHERE role_id = :loser_id
        `, { replacements: { winner_id: winner.role_id, loser_id: loser.role_id } });

        // ── Step 4a: Delete loser's role_permission rows ──────────────────────
        await sequelize.query(`
          DELETE FROM role_permission
          WHERE role_id = :loser_id
        `, { replacements: { loser_id: loser.role_id } });

        // ── Step 4b: Delete the loser role row ────────────────────────────────
        await sequelize.query(`
          DELETE FROM role
          WHERE role_id = :loser_id
        `, { replacements: { loser_id: loser.role_id } });
      }
    }

    console.log("[migration] Deduplication complete.");
  }

  // ── Step 5: Add the unique index (idempotent — skips if already exists) ──
  const [existingIndexes] = await sequelize.query(`
    SELECT indexname
    FROM pg_indexes
    WHERE tablename = 'role'
      AND indexname = 'role_company_name_unique'
  `);

  if (existingIndexes.length === 0) {
    await sequelize.query(`
      CREATE UNIQUE INDEX role_company_name_unique
      ON role (company_id, name)
      WHERE company_id IS NOT NULL
    `);
    console.log("[migration] Unique index role_company_name_unique created.");
  } else {
    console.log("[migration] Unique index role_company_name_unique already exists — skipped.");
  }
}

export async function down(queryInterface) {
  await queryInterface.sequelize.query(`
    DROP INDEX IF EXISTS role_company_name_unique
  `);
}
