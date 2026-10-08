"use strict";

/**
 * Daily updates can record the site temperature (°C) for the day.
 *
 * Optional: existing rows and updates posted without one stay null.
 *
 * Guarded with describeTable so a database whose column was already created
 * by sequelize.sync() is left as it is.
 */

const TABLE = "job_daily_update";

export async function up(queryInterface, Sequelize) {
  const columns = await queryInterface.describeTable(TABLE);

  if (!columns.temperature) {
    await queryInterface.addColumn(TABLE, "temperature", {
      type: Sequelize.DECIMAL(4, 1),
      allowNull: true,
    });
  }
}

export async function down(queryInterface) {
  const columns = await queryInterface.describeTable(TABLE);
  if (columns.temperature) await queryInterface.removeColumn(TABLE, "temperature");
}

export default { up, down };
