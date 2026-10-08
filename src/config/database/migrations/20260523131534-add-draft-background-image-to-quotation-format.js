"use strict";

export async function up(queryInterface, Sequelize) {
  const tableInfo = await queryInterface.describeTable("quotation_format");

  if (!tableInfo.draft_background_image) {
    await queryInterface.addColumn("quotation_format", "draft_background_image", {
      type: Sequelize.STRING(500),
      allowNull: true,
    });
  }
}

export async function down(queryInterface, Sequelize) {
  const tableInfo = await queryInterface.describeTable("quotation_format");

  if (tableInfo.draft_background_image) {
    await queryInterface.removeColumn("quotation_format", "draft_background_image");
  }
}
