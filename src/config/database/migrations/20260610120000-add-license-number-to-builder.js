"use strict";

export async function up(queryInterface, Sequelize) {
  const tableInfo = await queryInterface.describeTable("builder");

  if (!tableInfo.license_number) {
    await queryInterface.addColumn("builder", "license_number", {
      type: Sequelize.STRING(100),
      allowNull: true,
    });
  }
}

export async function down(queryInterface, Sequelize) {
  const tableInfo = await queryInterface.describeTable("builder");

  if (tableInfo.license_number) {
    await queryInterface.removeColumn("builder", "license_number");
  }
}
