"use strict";

/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface, Sequelize) {
  const table = await queryInterface.describeTable("job_process_task");

  if (!table.actual_date) {
    await queryInterface.addColumn("job_process_task", "actual_date", {
      type: Sequelize.DATEONLY,
      allowNull: true,
    });
  }

  if (!table.notes) {
    await queryInterface.addColumn("job_process_task", "notes", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  }

  if (!table.attachments) {
    await queryInterface.addColumn("job_process_task", "attachments", {
      type: Sequelize.JSONB,
      allowNull: true,
    });
  }
}

export async function down(queryInterface) {
  await queryInterface.removeColumn("job_process_task", "actual_date");
  await queryInterface.removeColumn("job_process_task", "notes");
  await queryInterface.removeColumn("job_process_task", "attachments");
}
