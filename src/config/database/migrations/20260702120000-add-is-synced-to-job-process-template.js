"use strict";

/**
 * Adds an `is_synced` flag to the GLOBAL TEMPLATE tables
 * (job_process_sub_stage / job_process_task).
 *
 * Only synced template sub-stages (and, within them, only synced template
 * tasks) are cloned into a job's instance tables when a job's workflow is
 * initialized. Defaults to TRUE so existing templates keep cloning everything
 * unless a user explicitly un-syncs an item.
 */

/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface, Sequelize) {
  const subStageTable = await queryInterface.describeTable("job_process_sub_stage");
  if (!subStageTable.is_synced) {
    await queryInterface.addColumn("job_process_sub_stage", "is_synced", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
  }

  const taskTable = await queryInterface.describeTable("job_process_task");
  if (!taskTable.is_synced) {
    await queryInterface.addColumn("job_process_task", "is_synced", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
  }
}

export async function down(queryInterface) {
  await queryInterface.removeColumn("job_process_sub_stage", "is_synced");
  await queryInterface.removeColumn("job_process_task", "is_synced");
}
