"use strict";

export async function up(queryInterface, Sequelize) {
  const tableInfo = await queryInterface.describeTable("quotation_version");
  if (!tableInfo.is_uploaded) {
    await queryInterface.addColumn("quotation_version", "is_uploaded", {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    });
  }
}

export async function down(queryInterface, Sequelize) {
  await queryInterface.removeColumn("quotation_version", "is_uploaded");
}
