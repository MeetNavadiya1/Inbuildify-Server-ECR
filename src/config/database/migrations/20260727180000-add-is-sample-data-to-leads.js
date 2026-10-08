"use strict";

/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface, Sequelize) {
  const leadsTable = await queryInterface.describeTable("leads");

  if (!leadsTable.is_sample_data) {
    await queryInterface.addColumn("leads", "is_sample_data", {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    });
  }
}

export async function down(queryInterface) {
  await queryInterface.removeColumn("leads", "is_sample_data");
}
