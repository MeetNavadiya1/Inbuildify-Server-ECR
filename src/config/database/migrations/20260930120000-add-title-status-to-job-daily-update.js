"use strict";

/**
 * Daily updates get a short title and a status.
 *
 * The Daily Updates tab now lists each update as a one-line row — a headline
 * ("Framing completed – Level 1") with a status badge — and keeps the long
 * "work completed" text as the description underneath.
 *
 * Existing rows keep a null title (the list falls back to the first line of
 * their work-completed text) and are marked in_progress, the neutral default.
 *
 * Guarded with describeTable so a database whose columns were already created
 * by sequelize.sync() is left as it is.
 */

const TABLE = "job_daily_update";

export async function up(queryInterface, Sequelize) {
  const columns = await queryInterface.describeTable(TABLE);

  if (!columns.title) {
    await queryInterface.addColumn(TABLE, "title", {
      type: Sequelize.STRING(150),
      allowNull: true,
    });
  }

  if (!columns.status) {
    await queryInterface.addColumn(TABLE, "status", {
      type: Sequelize.STRING(30),
      allowNull: false,
      defaultValue: "in_progress",
    });
  }
}

export async function down(queryInterface) {
  const columns = await queryInterface.describeTable(TABLE);
  if (columns.status) await queryInterface.removeColumn(TABLE, "status");
  if (columns.title) await queryInterface.removeColumn(TABLE, "title");
}

export default { up, down };
