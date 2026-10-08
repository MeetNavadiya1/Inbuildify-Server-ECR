"use strict";

/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface, Sequelize) {
  const table = await queryInterface.describeTable("job_process_task");
  if (table.is_completed) {
    return;
  }

  await queryInterface.addColumn("job_process_task", "is_completed", {
    type: Sequelize.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  });
}

export async function down(queryInterface) {
  await queryInterface.removeColumn("job_process_task", "is_completed");
}
