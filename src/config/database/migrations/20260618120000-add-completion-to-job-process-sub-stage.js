"use strict";

/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface, Sequelize) {
  const table = await queryInterface.describeTable("job_process_sub_stage");

  if (!table.is_completed) {
    await queryInterface.addColumn("job_process_sub_stage", "is_completed", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  }

  if (!table.is_skipped) {
    await queryInterface.addColumn("job_process_sub_stage", "is_skipped", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  }
}

export async function down(queryInterface) {
  await queryInterface.removeColumn("job_process_sub_stage", "is_completed");
  await queryInterface.removeColumn("job_process_sub_stage", "is_skipped");
}
