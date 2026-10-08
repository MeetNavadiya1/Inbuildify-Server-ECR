"use strict";

/**
 * Adds the lifecycle timestamps the Job Settings automations need.
 *
 * Settings → Job → Settings can automatically mark a job Completed (once the
 * final job-process stage is done) and then Archive it N days later. "N days
 * later" needs an anchor, so the job now records when it reached each state:
 *
 *   completed_at — stamped when status becomes "Completed"
 *   archived_at  — stamped when status becomes "Archived"
 *
 * Existing Completed jobs are backfilled from updated_at so the auto-archive
 * sweep has a baseline instead of ignoring them forever.
 *
 * Guarded with describeTable so re-running against a DB that already has the
 * columns (e.g. one synced via sequelize.sync) is a no-op.
 */

/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface, Sequelize) {
  const jobTable = await queryInterface.describeTable("job");

  if (!jobTable.completed_at) {
    await queryInterface.addColumn("job", "completed_at", {
      type: Sequelize.DATE,
      allowNull: true,
    });
  }

  if (!jobTable.archived_at) {
    await queryInterface.addColumn("job", "archived_at", {
      type: Sequelize.DATE,
      allowNull: true,
    });
  }

  await queryInterface.sequelize.query(
    `UPDATE job SET completed_at = updated_at
      WHERE status = 'Completed' AND completed_at IS NULL`,
  );

  await queryInterface.sequelize.query(
    `UPDATE job SET archived_at = updated_at
      WHERE status = 'Archived' AND archived_at IS NULL`,
  );
}

export async function down(queryInterface) {
  await queryInterface.removeColumn("job", "completed_at");
  await queryInterface.removeColumn("job", "archived_at");
}
