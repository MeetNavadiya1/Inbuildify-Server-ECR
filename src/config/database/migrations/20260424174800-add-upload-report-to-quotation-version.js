"use strict";

export async function up(queryInterface, Sequelize) {
  const tableInfo = await queryInterface.describeTable("quotation_version");
  if (!tableInfo.upload_report) {
    await queryInterface.addColumn("quotation_version", "upload_report", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  }
}

export async function down(queryInterface, Sequelize) {
  await queryInterface.removeColumn("quotation_version", "upload_report");
}
