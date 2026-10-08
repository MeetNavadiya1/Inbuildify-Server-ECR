"use strict";

export async function up(queryInterface, Sequelize) {
  const tableInfo = await queryInterface.describeTable("quotation_version");
  if (!tableInfo.quotation_version_detail) {
    await queryInterface.addColumn("quotation_version", "quotation_version_detail", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  }
}

export async function down(queryInterface, Sequelize) {
  await queryInterface.removeColumn("quotation_version", "quotation_version_detail");
}
