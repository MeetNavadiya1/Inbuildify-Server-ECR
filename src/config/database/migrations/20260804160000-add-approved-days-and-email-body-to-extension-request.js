"use strict";

/**
 * Adds `approved_days` and `email_body` to job_task_extension_request.
 *
 * Both belong to the create-table migration conceptually, and are declared
 * there — but that migration had already run by the time they were added, and
 * Umzug tracks migrations by filename, so editing it was a no-op. Databases
 * created before this point have the table without these two columns while the
 * model declares them, which makes every read of the table fail.
 *
 *   approved_days — what the responder actually granted, which may differ from
 *                   the requested extension_days. Null until decided, and left
 *                   null on a rejection.
 *   email_body    — the HTML message the builder composed and reviewed before
 *                   sending, kept so the sent email can be shown back verbatim.
 *
 * Guarded with describeTable, so on a database created from the current
 * create-table migration (which already includes both) this is a no-op.
 */

/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface, Sequelize) {
  const table = await queryInterface.describeTable("job_task_extension_request");

  if (!table.approved_days) {
    await queryInterface.addColumn("job_task_extension_request", "approved_days", {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
  }

  if (!table.email_body) {
    await queryInterface.addColumn("job_task_extension_request", "email_body", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  }
}

export async function down(queryInterface) {
  await queryInterface.removeColumn("job_task_extension_request", "email_body");
  await queryInterface.removeColumn("job_task_extension_request", "approved_days");
}
