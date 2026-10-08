"use strict";

/**
 * RBAC Phase 4 — row-level scoping columns on the `job` table.
 *
 *  - supervisor_id        → users.users_id of the Site Supervisor assigned to
 *                           the job. Site Supervisor (SITE_ASSIGNED scope) only
 *                           sees jobs where supervisor_id = self.
 *  - customer_contact_id  → users.users_id of the homebuyer Contact who owns
 *                           the job. Contact (JOB_ONLY scope) only sees jobs
 *                           where customer_contact_id = self.
 *
 * Both are nullable (a job may have neither assigned yet) and SET NULL on the
 * referenced user being removed. Idempotent: safe to re-run.
 */

export async function up(queryInterface, Sequelize) {
  const jobInfo = await queryInterface.describeTable("job");

  if (!jobInfo.supervisor_id) {
    await queryInterface.addColumn("job", "supervisor_id", {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "users", key: "users_id" },
      onDelete: "SET NULL",
    });
    console.log("✅ Added job.supervisor_id");
  } else {
    console.log("⏭️  job.supervisor_id already exists, skipping");
  }

  if (!jobInfo.customer_contact_id) {
    await queryInterface.addColumn("job", "customer_contact_id", {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "users", key: "users_id" },
      onDelete: "SET NULL",
    });
    console.log("✅ Added job.customer_contact_id");
  } else {
    console.log("⏭️  job.customer_contact_id already exists, skipping");
  }
}

export async function down(queryInterface) {
  const jobInfo = await queryInterface.describeTable("job");

  if (jobInfo.customer_contact_id) {
    await queryInterface.removeColumn("job", "customer_contact_id");
  }
  if (jobInfo.supervisor_id) {
    await queryInterface.removeColumn("job", "supervisor_id");
  }
}
