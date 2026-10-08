"use strict";

/**
 * Adds the "Complete Job" approval columns to the `job` table.
 *
 * Before a construction job can be marked Handover Completed, the Confirmation
 * modal now requires a Company Administrator or Site Supervisor to accept the
 * emailed approval request. These columns hold that single approval, mirroring
 * the commencement_ack_* columns already on this table.
 *
 * Guarded with describeTable so re-running against a DB that already has the
 * columns (e.g. one synced via sequelize.sync) is a no-op.
 */

/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface, Sequelize) {
  const jobTable = await queryInterface.describeTable("job");

  if (!jobTable.completion_approver_user_id) {
    await queryInterface.addColumn("job", "completion_approver_user_id", {
      type: Sequelize.UUID,
      allowNull: true,
    });
  }

  if (!jobTable.completion_approval_status) {
    await queryInterface.addColumn("job", "completion_approval_status", {
      type: Sequelize.STRING(20),
      allowNull: true,
    });
  }

  if (!jobTable.completion_approval_comments) {
    await queryInterface.addColumn("job", "completion_approval_comments", {
      type: Sequelize.STRING(500),
      allowNull: true,
    });
  }

  if (!jobTable.completion_approval_sent_at) {
    await queryInterface.addColumn("job", "completion_approval_sent_at", {
      type: Sequelize.DATE,
      allowNull: true,
    });
  }

  if (!jobTable.completion_approval_at) {
    await queryInterface.addColumn("job", "completion_approval_at", {
      type: Sequelize.DATE,
      allowNull: true,
    });
  }
}

export async function down(queryInterface) {
  await queryInterface.removeColumn("job", "completion_approver_user_id");
  await queryInterface.removeColumn("job", "completion_approval_status");
  await queryInterface.removeColumn("job", "completion_approval_comments");
  await queryInterface.removeColumn("job", "completion_approval_sent_at");
  await queryInterface.removeColumn("job", "completion_approval_at");
}
