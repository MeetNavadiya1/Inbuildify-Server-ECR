"use strict";

/**
 * Adds `previous_unit_price` to estimate_material — the unit price a material
 * had before its last price change, so the Materials tab and the cost sheet can
 * show the change as "❗ $50.00 → $60.00".
 *
 * NULL means the price has never been changed since the column was added.
 *
 * Guarded with describeTable so re-running against a DB already carrying the
 * column (e.g. one synced via sequelize.sync) is a no-op.
 */

/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface, Sequelize) {
  const material = await queryInterface.describeTable("estimate_material");

  if (!material.previous_unit_price) {
    await queryInterface.addColumn("estimate_material", "previous_unit_price", {
      type: Sequelize.DECIMAL(14, 4),
      allowNull: true,
    });
  }
}

export async function down(queryInterface) {
  await queryInterface.removeColumn("estimate_material", "previous_unit_price");
}

export default { up, down };
