"use strict";

// Scope timeline entries to a job. When a lead is converted to a job, the job
// gets its own Action timeline that starts empty: notes/tasks/appointments
// created in the job context carry a job_id, while lead-owned entries keep
// job_id = NULL. The lead view filters job_id IS NULL; the job view filters by
// job_id, so the two timelines stay separate.
const TABLES = ["notes", "task", "appointment"];

export async function up(queryInterface, Sequelize) {
  for (const table of TABLES) {
    const tableInfo = await queryInterface.describeTable(table);
    if (!tableInfo.job_id) {
      await queryInterface.addColumn(table, "job_id", {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "job", key: "job_id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      });
      await queryInterface.addIndex(table, ["job_id"], { name: `${table}_job_id_idx` });
    }
  }
}

export async function down(queryInterface) {
  for (const table of TABLES) {
    await queryInterface.removeColumn(table, "job_id");
  }
}
