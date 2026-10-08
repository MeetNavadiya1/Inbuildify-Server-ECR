"use strict";

/**
 * Adds an `is_synced` flag to the JOB-SPECIFIC instance tables
 * (job_sub_stage / job_task).
 *
 * Unlike the template flag (which controls what gets cloned INTO a job), this
 * per-job flag lets a stage be synced / un-synced within a single job from the
 * Job Status screen. Un-syncing a stage cascades to every sub-stage and task in
 * that stage for that job, but keeps the rows (and their completion data,
 * notes, attachments) so the action is fully reversible.
 *
 * Defaults to TRUE so every already-cloned job row stays synced until a user
 * explicitly un-syncs it.
 */

/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface, Sequelize) {
  const subStageTable = await queryInterface.describeTable("job_sub_stage");
  if (!subStageTable.is_synced) {
    await queryInterface.addColumn("job_sub_stage", "is_synced", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
  }

  const taskTable = await queryInterface.describeTable("job_task");
  if (!taskTable.is_synced) {
    await queryInterface.addColumn("job_task", "is_synced", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
  }
}

export async function down(queryInterface) {
  await queryInterface.removeColumn("job_sub_stage", "is_synced");
  await queryInterface.removeColumn("job_task", "is_synced");
}
