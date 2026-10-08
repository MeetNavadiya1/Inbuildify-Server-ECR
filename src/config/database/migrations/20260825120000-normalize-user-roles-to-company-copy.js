"use strict";

/**
 * Migration: put every user on their OWN company's copy of their role.
 *
 * Each company is provisioned with its own copy of every system role, and
 * Settings → Role Management only ever lists and writes those company-scoped
 * rows. Two users can therefore both read as "Contact" while sitting on two
 * different role rows — one on the company copy, one on the platform template
 * (role.company_id IS NULL) or, after a stale role_id was posted back from a
 * pre-filled form, on some other company's row entirely. Only the company copy
 * receives what the admin ticks in the permission grid, so the other user
 * silently gets nothing.
 *
 * 20260824120000 repaired the users sitting on the global template row. This one
 * generalises that to any role row that is not the user's own company's copy,
 * and is the data-side companion to resolveRoleIdForCompany(), which now
 * normalises the role_id on every user create/update.
 *
 * Matching is by role NAME within the user's effective company (users.company_id
 * when set, otherwise the company that owns their builder — the same rule
 * authMiddleware applies). Users whose company has no role of that name, and
 * genuinely platform-scoped accounts, are left untouched.
 *
 * Idempotent: re-running it finds nothing left to move.
 */

export async function up(queryInterface) {
  const { sequelize } = queryInterface;

  const [updated] = await sequelize.query(`
    WITH scoped AS (
      SELECT u.users_id,
             cr.role_id AS company_role_id
        FROM users u
        JOIN role ur        ON ur.role_id = u.role_id
        LEFT JOIN builder b ON b.builder_id = u.builder_id
        JOIN role cr        ON cr.name = ur.name
                           AND cr.company_id = COALESCE(u.company_id, b.company_id)
       WHERE ur.company_id IS DISTINCT FROM COALESCE(u.company_id, b.company_id)
    )
    UPDATE users u
       SET role_id = s.company_role_id,
           updated_at = NOW()
      FROM scoped s
     WHERE u.users_id = s.users_id
    RETURNING u.users_id
  `);

  console.log(
    `[migration] Normalised ${updated.length} user(s) onto their own company's copy of their role.`,
  );
}

export async function down() {
  // Irreversible by design: the previous value was a role row outside the user's
  // company, which is exactly the state this migration exists to correct.
  console.log("[migration] normalize-user-roles-to-company-copy: nothing to revert.");
}
