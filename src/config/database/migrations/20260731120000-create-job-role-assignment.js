"use strict";

/**
 * Per-job role assignments — the storage behind the job header's "Assign Roles"
 * modal.
 *
 * `user_role_mapping` already says which users *hold* a role inside the tenant,
 * but that is company-wide: it cannot answer "who is the Colour Consultant on
 * job LD20260010?". This table is the job-scoped answer — one row per
 * (job, role) naming the user responsible for that role on that job.
 *
 * Unassigning a role deletes its row rather than writing user_id = NULL, so the
 * table only ever holds live assignments and `(job_id, role_id)` stays unique.
 */

/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface, Sequelize) {
  const tables = await queryInterface.showAllTables();
  if (tables.includes("job_role_assignment")) return;

  await queryInterface.createTable("job_role_assignment", {
    job_role_assignment_id: {
      type: Sequelize.UUID,
      defaultValue: Sequelize.literal("gen_random_uuid()"),
      primaryKey: true,
    },
    job_id: {
      type: Sequelize.UUID,
      allowNull: false,
      references: { model: "job", key: "job_id" },
      onDelete: "CASCADE",
    },
    role_id: {
      type: Sequelize.UUID,
      allowNull: false,
      references: { model: "role", key: "role_id" },
      onDelete: "CASCADE",
    },
    // The user responsible for this role on this job. The row is deleted when
    // the role is cleared in the modal, so this is never NULL in practice.
    user_id: {
      type: Sequelize.UUID,
      allowNull: false,
      references: { model: "users", key: "users_id" },
      onDelete: "CASCADE",
    },
    // Tenant-scoping columns, mirrored from the job (same pattern as job_delay).
    builder_id: { type: Sequelize.UUID, allowNull: true },
    company_id: { type: Sequelize.UUID, allowNull: true },
    assigned_by: { type: Sequelize.UUID, allowNull: true },
    assigned_at: { type: Sequelize.DATE, allowNull: true },
    created_by: { type: Sequelize.UUID, allowNull: true },
    updated_by: { type: Sequelize.UUID, allowNull: true },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
  });

  // One user per role per job — makes the bulk save idempotent.
  await queryInterface.addIndex("job_role_assignment", ["job_id", "role_id"], {
    name: "job_role_assignment_job_role_uniq",
    unique: true,
  });

  // "Which jobs is this user on?" — used by job list filters.
  await queryInterface.addIndex("job_role_assignment", ["user_id"], {
    name: "job_role_assignment_user_idx",
  });
}

export async function down(queryInterface) {
  await queryInterface.dropTable("job_role_assignment");
}
