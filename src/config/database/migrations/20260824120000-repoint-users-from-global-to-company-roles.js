"use strict";

/**
 * Migration: re-point users sitting on a global (platform template) role row
 * onto their own company's copy of that role.
 *
 * Every company is provisioned with its own copy of each system role, and
 * Settings → Role Management only lists and writes those company-scoped rows.
 * A user attached to the global template row (role.company_id IS NULL) resolves
 * permissions against the platform defaults instead, so nothing a Company Admin
 * ticks in the permission grid ever reaches them — e.g. granting Contact
 * "Leads: read/create" left every contact without the Leads module.
 *
 * The auto-created Contact (lead → contact mapping) and Agent (referral partner)
 * users were the ones drifting, because those code paths looked the role up by
 * name with no company filter. That is fixed in the services; this migration
 * repairs the rows already written.
 *
 * A company copy is only used when one exists — users whose company has not been
 * provisioned, and genuinely platform-scoped accounts, are left untouched.
 */

export async function up(queryInterface) {
  const { sequelize } = queryInterface;

  // A user's effective company is users.company_id when set, otherwise the
  // company that owns their builder (same rule authMiddleware applies).
  const [updated] = await sequelize.query(`
    WITH scoped AS (
      SELECT u.users_id,
             cr.role_id AS company_role_id
        FROM users u
        JOIN role gr        ON gr.role_id = u.role_id
                           AND gr.company_id IS NULL
        LEFT JOIN builder b ON b.builder_id = u.builder_id
        JOIN role cr        ON cr.name = gr.name
                           AND cr.company_id = COALESCE(u.company_id, b.company_id)
    )
    UPDATE users u
       SET role_id = s.company_role_id,
           updated_at = NOW()
      FROM scoped s
     WHERE u.users_id = s.users_id
    RETURNING u.users_id
  `);

  console.log(
    `[migration] Re-pointed ${updated.length} user(s) from a global role row to their company's copy.`,
  );
}

export async function down() {
  // Irreversible by design: the previous value was the global template row,
  // which is exactly the state this migration exists to correct. Putting users
  // back would reintroduce the bug, so this is a no-op.
  console.log("[migration] repoint-users-from-global-to-company-roles: nothing to revert.");
}
