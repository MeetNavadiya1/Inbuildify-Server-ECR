"use strict";

/**
 * Migration: re-point any users whose role_id is a global (company_id IS NULL)
 * role to the matching company-scoped copy of that role.
 *
 * Background: at company sign-up, the root user was assigned the global
 * "Company Administrator" role_id. seedCompanyRbac then created a
 * company-scoped copy with a different role_id, but the user row was never
 * updated. This caused permission saves (written to the company-scoped role)
 * to be invisible at request time (resolver read from the global role).
 *
 * For each user:
 *   1. Look up their current role row.
 *   2. If it is a global role (company_id IS NULL), find the company-scoped
 *      role for that user's company with the same name.
 *   3. If found, update the user's role_id to the company-scoped role.
 */

export async function up(queryInterface) {
  const { sequelize } = queryInterface;

  // Find all users whose current role is a global role (company_id IS NULL)
  const [affectedUsers] = await sequelize.query(`
    SELECT u.users_id, u.company_id, r.name AS role_name, r.role_id AS global_role_id
    FROM users u
    JOIN role r ON r.role_id = u.role_id
    WHERE r.company_id IS NULL
      AND u.company_id IS NOT NULL
  `);

  if (affectedUsers.length === 0) {
    console.log("[migration] No users with global role_id found — nothing to do.");
    return;
  }

  console.log(`[migration] Found ${affectedUsers.length} user(s) with global role_id — re-pointing to company-scoped roles...`);

  let fixed = 0;
  let skipped = 0;

  for (const user of affectedUsers) {
    const { users_id, company_id, role_name } = user;

    // Find the company-scoped copy of this role
    const [companyRoles] = await sequelize.query(`
      SELECT role_id
      FROM role
      WHERE company_id = :company_id
        AND name       = :role_name
      LIMIT 1
    `, { replacements: { company_id, role_name } });

    if (companyRoles.length === 0) {
      console.warn(`[migration] No company-scoped "${role_name}" role found for company ${company_id} — skipping user ${users_id}`);
      skipped++;
      continue;
    }

    const companyRoleId = companyRoles[0].role_id;

    await sequelize.query(`
      UPDATE users
      SET role_id    = :company_role_id,
          updated_at = NOW()
      WHERE users_id = :users_id
    `, { replacements: { company_role_id: companyRoleId, users_id } });

    fixed++;
  }

  console.log(`[migration] Done: ${fixed} user(s) fixed, ${skipped} skipped.`);
}

export async function down(queryInterface) {
  // Intentionally no-op: we cannot reliably reverse this without knowing
  // which users were actually modified, and reverting would re-introduce the bug.
  console.log("[migration] down: no-op — role_id fix cannot be safely reversed.");
}
