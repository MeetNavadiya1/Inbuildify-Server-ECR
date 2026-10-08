"use strict";

/**
 * Records who added a job workflow task.
 *
 * Needed by the "Show all Tasks to all Roles" visibility rule: with the setting
 * off, a task assigned to another role is hidden from the viewer. That filter
 * runs on read but not on the create response, so a task the user had just
 * added showed once and then disappeared on the next page load. Knowing the
 * creator lets the filter keep a user's own tasks visible whichever role they
 * assigned them to.
 *
 * Existing rows keep a NULL creator — they simply fall back to the role rules,
 * exactly as before.
 *
 * Guarded with describeTable so re-running against a DB already carrying the
 * column (e.g. one synced via sequelize.sync) is a no-op.
 */

/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface, Sequelize) {
  const jobTask = await queryInterface.describeTable("job_task");

  if (!jobTask.created_by) {
    await queryInterface.addColumn("job_task", "created_by", {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "users", key: "users_id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });
  }
}

export async function down(queryInterface) {
  await queryInterface.removeColumn("job_task", "created_by");
}
