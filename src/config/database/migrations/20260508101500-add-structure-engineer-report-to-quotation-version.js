"use strict";

export async function up(queryInterface, Sequelize) {
  const tableInfo = await queryInterface.describeTable("quotation_version");
  if (!tableInfo.structure_engineer_report) {
    await queryInterface.addColumn("quotation_version", "structure_engineer_report", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  }
}

export async function down(queryInterface, Sequelize) {
  await queryInterface.removeColumn("quotation_version", "structure_engineer_report");
}
