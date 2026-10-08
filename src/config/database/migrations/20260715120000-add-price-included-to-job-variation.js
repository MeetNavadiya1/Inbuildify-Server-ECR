"use strict";

/**
 * Add job_variation.price_included — the answer to the "Price Included in
 * contract ?" step of the variation status tracker. Nullable on purpose:
 * NULL = not answered yet, true = Included (no invoice is owed, the tracker
 * skips "Send Invoice to Customer"), false = Not Included (the customer is
 * invoiced for the variation amount).
 */
export async function up(queryInterface, Sequelize) {
  const table = await queryInterface.describeTable("job_variation");
  if (!table.price_included) {
    await queryInterface.addColumn("job_variation", "price_included", {
      type: Sequelize.BOOLEAN,
      allowNull: true,
    });
  }
}

export async function down(queryInterface) {
  const table = await queryInterface.describeTable("job_variation");
  if (table.price_included) {
    await queryInterface.removeColumn("job_variation", "price_included");
  }
}
