"use strict";

export async function up(queryInterface, Sequelize) {
  const tableInfo = await queryInterface.describeTable("company");

  if (!tableInfo.website) {
    await queryInterface.addColumn("company", "website", {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
  }
}

export async function down(queryInterface, Sequelize) {
  const tableInfo = await queryInterface.describeTable("company");

  if (tableInfo.website) {
    await queryInterface.removeColumn("company", "website");
  }
}
