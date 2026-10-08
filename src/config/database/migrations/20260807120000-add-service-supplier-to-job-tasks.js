"use strict";

/**
 * A workflow task is now handed to a SUPPLIER for a SERVICE.
 *
 * `service_id` is what the task is (Plumbing, Framing, …) and `supplier_id` is
 * who is doing it. They replace the Role/Assignee pair in the workflow UI, but
 * NOT in the database: `assignee_id` (role) and `assignee_user_id` (person) are
 * left in place because the role still drives the "Show all Tasks to all Roles"
 * visibility filter and every existing row is assigned that way. New tasks
 * simply carry a service/supplier instead, and both pairs are read back.
 *
 * Added to both task families because the shared job-process task service
 * operates on either one via the table router:
 *   - job_process_task = the builder's template task
 *   - job_task         = a job's own cloned instance
 *
 * Both columns are nullable: existing rows carry no service or supplier, which
 * is exactly what they had.
 *
 * Guarded with describeTable so re-running against a DB already carrying the
 * columns (e.g. one synced via sequelize.sync) is a no-op.
 */

const TABLES = ["job_process_task", "job_task"];

const COLUMNS = {
  service_id: { model: "service", key: "service_id" },
  supplier_id: { model: "supplier", key: "supplier_id" },
};

/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface, Sequelize) {
  for (const table of TABLES) {
    const described = await queryInterface.describeTable(table);
    for (const [column, references] of Object.entries(COLUMNS)) {
      if (described[column]) continue;
      await queryInterface.addColumn(table, column, {
        type: Sequelize.UUID,
        allowNull: true,
        references,
        onUpdate: "CASCADE",
        // Deleting a service or supplier leaves the task standing with nobody
        // on it, the same way a deleted role/user does.
        onDelete: "SET NULL",
      });
    }
  }
}

export async function down(queryInterface) {
  for (const table of [...TABLES].reverse()) {
    for (const column of Object.keys(COLUMNS).reverse()) {
      await queryInterface.removeColumn(table, column);
    }
  }
}
