"use strict";

/**
 * Migration: Retroactively seed RBAC roles for existing companies.
 *
 * When the dynamic RBAC feature was introduced, new companies got roles seeded
 * via company-onboarding. However, existing companies did not get their roles
 * seeded, leading to "No roles found" on the frontend and broken permission checks.
 *
 * This migration:
 * 1. Finds all companies that have NO roles assigned to them in the `role` table.
 * 2. For each company, seeds the system roles by copying global roles.
 * 3. Updates all users in that company who are pointing to global roles,
 *    re-pointing them to the newly created company-scoped roles.
 */

export async function up(queryInterface) {
  const { sequelize } = queryInterface;

  // Find all companies that have NO roles
  const [unseededCompanies] = await sequelize.query(`
    SELECT c.company_id
    FROM company c
    LEFT JOIN role r ON r.company_id = c.company_id
    WHERE r.role_id IS NULL
  `);

  if (unseededCompanies.length === 0) {
    console.log("[migration] All companies already have roles seeded. Nothing to do.");
  } else {
    console.log(`[migration] Found ${unseededCompanies.length} existing company/companies missing roles. Seeding now...`);

    const now = new Date();

    // Load global system roles
    const [globalRoles] = await sequelize.query(`
      SELECT role_id, name, description, is_system
      FROM role
      WHERE company_id IS NULL AND is_system = TRUE
    `);

    if (globalRoles.length === 0) {
      console.warn("[migration] No global system roles found. Cannot seed companies.");
      return;
    }

    for (const row of unseededCompanies) {
      const companyId = row.company_id;

      // Find a builder_id for this company (if any)
      const [builders] = await sequelize.query(`
        SELECT builder_id FROM builder WHERE company_id = :companyId LIMIT 1
      `, { replacements: { companyId } });
      const builderId = builders.length > 0 ? builders[0].builder_id : null;

      // Find a Company Administrator user to act as created_by (if any)
      const [users] = await sequelize.query(`
        SELECT users_id FROM users WHERE company_id = :companyId LIMIT 1
      `, { replacements: { companyId } });
      const createdBy = users.length > 0 ? users[0].users_id : null;

      const roleIdMapping = new Map(); // globalRoleId -> newCompanyRoleId

      // 1. Seed Roles
      for (const globalRole of globalRoles) {
        let companyRoleId = null;
        try {
          const [insertedRows] = await sequelize.query(`
            INSERT INTO role
              (role_id, name, description, company_id, builder_id, is_system, is_active,
               created_by, updated_by, created_at, updated_at)
            VALUES
              (gen_random_uuid(), :name, :description, :company_id, :builder_id,
               TRUE, TRUE, :created_by, :created_by, :now, :now)
            RETURNING role_id
          `, {
            replacements: {
              name: globalRole.name,
              description: globalRole.description || `System role: ${globalRole.name}`,
              company_id: companyId,
              builder_id: builderId,
              created_by: createdBy,
              now
            }
          });
          companyRoleId = insertedRows[0].role_id;
        } catch (err) {
          // If role already exists due to dirty data or a previous partial migration, just fetch the existing one
          const [existingRows] = await sequelize.query(`
            SELECT role_id FROM role WHERE LOWER(name) = LOWER(:name) AND company_id = :company_id
          `, { replacements: { name: globalRole.name, company_id: companyId } });
          if (existingRows.length > 0) {
            companyRoleId = existingRows[0].role_id;
          }
        }
        
        if (companyRoleId) {
          roleIdMapping.set(globalRole.role_id, companyRoleId);
        }
      }

      // 2. Seed Role Permissions
      const globalRoleIds = Array.from(roleIdMapping.keys());
      const [globalPerms] = await sequelize.query(`
        SELECT role_id, module_name, can_create, can_read, can_update, can_delete
        FROM role_permission
        WHERE role_id IN (:role_ids)
          AND company_id IS NULL
          AND builder_id IS NULL
          AND is_active = TRUE
      `, { replacements: { role_ids: globalRoleIds } });

      for (const perm of globalPerms) {
        const companyRoleId = roleIdMapping.get(perm.role_id);
        if (!companyRoleId) continue;

        await sequelize.query(`
          INSERT INTO role_permission
            (role_permission_id, role_id, company_id, builder_id, module_name,
             can_create, can_read, can_update, can_delete, is_active,
             created_by, updated_by, created_at, updated_at)
          VALUES
            (gen_random_uuid(), :role_id, :company_id, :builder_id, :module_name,
             :can_create, :can_read, :can_update, :can_delete, TRUE,
             :created_by, :created_by, :now, :now)
          ON CONFLICT (role_id, module_name, company_id, builder_id) DO NOTHING
        `, {
          replacements: {
            role_id: companyRoleId,
            company_id: companyId,
            builder_id: builderId,
            module_name: perm.module_name,
            can_create: perm.can_create,
            can_read: perm.can_read,
            can_update: perm.can_update,
            can_delete: perm.can_delete,
            created_by: createdBy,
            now
          }
        });
      }
      
      console.log(`[migration] Seeded ${globalRoles.length} roles and ${globalPerms.length} permissions for company ${companyId}`);
    }
  }

  // Next, run the global role ID fix for ALL users in ANY company,
  // just in case any were missed previously.
  const [affectedUsers] = await sequelize.query(`
    SELECT u.users_id, u.company_id, r.name AS role_name, r.role_id AS global_role_id
    FROM users u
    JOIN role r ON r.role_id = u.role_id
    WHERE r.company_id IS NULL
      AND u.company_id IS NOT NULL
  `);

  if (affectedUsers.length > 0) {
    console.log(`[migration] Found ${affectedUsers.length} user(s) with global role_id — re-pointing to company-scoped roles...`);

    let fixed = 0;
    let skipped = 0;

    for (const user of affectedUsers) {
      const { users_id, company_id, role_name } = user;

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

      await sequelize.query(`
        UPDATE users
        SET role_id    = :company_role_id,
            updated_at = NOW()
        WHERE users_id = :users_id
      `, { replacements: { company_role_id: companyRoles[0].role_id, users_id } });

      fixed++;
    }
    console.log(`[migration] Done: ${fixed} user(s) fixed, ${skipped} skipped.`);
  }
}

export async function down(queryInterface) {
  console.log("[migration] down: no-op — cannot safely revert retroactive seeding.");
}
