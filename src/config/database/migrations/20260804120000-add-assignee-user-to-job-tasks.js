"use strict";

/**
 * Splits a workflow task's "assignee" into the role and the person.
 *
 * `assignee_id` has always been a FK to `role` — the task table never held a
 * user. The Role column in the workflow UI reads it, and the Assignee column
 * only ever resolved a name for legacy rows whose assignee_id happened to point
 * at a user, so it rendered "-" for every current row.
 *
 * `assignee_user_id` is the actual person the task is assigned to. It sits
 * alongside the role rather than replacing it: the role still drives the
 * "Show all Tasks to all Roles" visibility filter, and picking a role is what
 * narrows the user list the assignee is chosen from.
 *
 * Added to both task families because the shared job-process task service
 * operates on either one via the table router:
 *   - job_process_task = the builder's template task
 *   - job_task         = a job's own cloned instance
 *
 * Existing rows keep a NULL assignee, which is what they effectively had.
 *
 * Guarded with describeTable so re-running against a DB already carrying the
 * column (e.g. one synced via sequelize.sync) is a no-op.
 */

const COLUMN = {
  allowNull: true,
  references: { model: "users", key: "users_id" },
  onUpdate: "CASCADE",
  onDelete: "SET NULL",
};

/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface, Sequelize) {
  for (const table of ["job_process_task", "job_task"]) {
    const described = await queryInterface.describeTable(table);
    if (!described.assignee_user_id) {
      await queryInterface.addColumn(table, "assignee_user_id", {
        type: Sequelize.UUID,
        ...COLUMN,
      });
    }
  }
}

export async function down(queryInterface) {
  await queryInterface.removeColumn("job_task", "assignee_user_id");
  await queryInterface.removeColumn("job_process_task", "assignee_user_id");
}
