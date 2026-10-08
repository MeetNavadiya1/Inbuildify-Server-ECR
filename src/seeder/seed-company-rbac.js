/**
 * P3 — Per-company RBAC provisioning.
 *
 * When a new company registers, this function seeds that company with a copy
 * of every predefined (system) role and its global default role_permission rows.
 * This gives every tenant a sensible starting point that the Company Admin can
 * then customise via the Settings → Role Management screen.
 *
 * Design decisions (§3 Goals / §9 Edge Cases):
 *   - Source of truth: global role rows (company_id IS NULL, is_system = true)
 *     and their matching global role_permission rows (company_id IS NULL,
 *     builder_id IS NULL).
 *   - System roles are cloned INTO the company with is_system = true so the
 *     UI can protect them from delete/rename while still allowing CRUD edits.
 *   - Custom roles (company_id NOT NULL) are NOT cloned — they are
 *     company-private by definition.
 *   - Idempotent: uses INSERT … ON CONFLICT DO NOTHING so calling twice is safe.
 *   - Transactional: caller passes an external transaction so the whole
 *     company sign-up is atomic.
 */

import db from "../config/database/models/postgre-models/index.js";

/**
 * Seed per-company RBAC rows for a freshly registered company.
 *
 * @param {object} opts
 * @param {string} opts.company_id   UUID of the new company
 * @param {string} opts.builder_id   UUID of the default builder for this company
 * @param {string} opts.created_by   UUID of the Company Administrator user
 * @param {object} opts.transaction  Sequelize transaction (required — must be open)
 */
export async function seedCompanyRbac({ company_id, builder_id, created_by, transaction }) {
  const sequelize = db.sequelize;
  const now = new Date();

  // ── 1. Load all global (system) roles ───────────────────────────────────────
  const [globalRoles] = await sequelize.query(
    `SELECT role_id, name, description, is_system
     FROM role
     WHERE company_id IS NULL AND is_system = TRUE`,
    { transaction }
  );

  if (globalRoles.length === 0) {
    console.warn("[seedCompanyRbac] No global system roles found. Run the RBAC seed migration first.");
    return;
  }

  // ── 2. Upsert per-company role rows ─────────────────────────────────────────
  // We create a company-scoped copy of every system role. The new role row has:
  //   company_id  = the new company
  //   builder_id  = the default builder
  //   is_system   = true  (so the UI protects these from delete/rename)
  //   is_active   = true
  const roleIdMapping = new Map(); // globalRoleId → newCompanyRoleId

  for (const globalRole of globalRoles) {
    // Check for existing company-scoped row (idempotency)
    const [existing] = await sequelize.query(
      `SELECT role_id FROM role
       WHERE name = :name AND company_id = :company_id
       LIMIT 1`,
      { replacements: { name: globalRole.name, company_id }, transaction }
    );

    let companyRoleId;
    if (existing.length > 0) {
      companyRoleId = existing[0].role_id;
    } else {
      const [insertedRows] = await sequelize.query(
        `INSERT INTO role
           (role_id, name, description, company_id, builder_id, is_system, is_active,
            created_by, updated_by, created_at, updated_at)
         VALUES
           (gen_random_uuid(), :name, :description, :company_id, :builder_id,
            TRUE, TRUE, :created_by, :created_by, :now, :now)
         RETURNING role_id`,
        {
          replacements: {
            name: globalRole.name,
            description: globalRole.description || `System role: ${globalRole.name}`,
            company_id,
            builder_id: builder_id || null,
            created_by: created_by || null,
            now,
          },
          transaction,
        }
      );
      companyRoleId = insertedRows[0].role_id;
    }

    roleIdMapping.set(globalRole.role_id, companyRoleId);
  }

  // ── 3. Load global role_permission rows ────────────────────────────────────
  const globalRoleIds = Array.from(roleIdMapping.keys());
  if (globalRoleIds.length === 0) return;

  const [globalPerms] = await sequelize.query(
    `SELECT role_id, module_name, can_create, can_read, can_update, can_delete
     FROM role_permission
     WHERE role_id IN (:role_ids)
       AND company_id IS NULL
       AND builder_id IS NULL
       AND is_active = TRUE`,
    { replacements: { role_ids: globalRoleIds }, transaction }
  );

  // ── 4. Upsert per-company role_permission rows ──────────────────────────────
  for (const perm of globalPerms) {
    const companyRoleId = roleIdMapping.get(perm.role_id);
    if (!companyRoleId) continue;

    // Idempotent — skip if the row already exists
    await sequelize.query(
      `INSERT INTO role_permission
         (role_permission_id, role_id, company_id, builder_id, module_name,
          can_create, can_read, can_update, can_delete, is_active,
          created_by, updated_by, created_at, updated_at)
       VALUES
         (gen_random_uuid(), :role_id, :company_id, :builder_id, :module_name,
          :can_create, :can_read, :can_update, :can_delete, TRUE,
          :created_by, :created_by, :now, :now)
       ON CONFLICT (role_id, module_name, company_id, builder_id) DO NOTHING`,
      {
        replacements: {
          role_id: companyRoleId,
          company_id,
          builder_id: builder_id || null,
          module_name: perm.module_name,
          can_create: perm.can_create,
          can_read: perm.can_read,
          can_update: perm.can_update,
          can_delete: perm.can_delete,
          created_by: created_by || null,
          now,
        },
        transaction,
      }
    );
  }

  console.log(
    `[seedCompanyRbac] Provisioned ${roleIdMapping.size} roles and ${globalPerms.length} permissions for company ${company_id}`
  );

  return roleIdMapping; // globalRoleId → companyRoleId
}

export default { seedCompanyRbac };
