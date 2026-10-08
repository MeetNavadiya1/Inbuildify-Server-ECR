"use strict";

export async function up(queryInterface, Sequelize) {
  const tableInfo = await queryInterface.describeTable("quotation_version");
  if (!tableInfo.send_to_engineer) {
    await queryInterface.addColumn("quotation_version", "send_to_engineer", {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    });
  }
}

export async function down(queryInterface, Sequelize) {
  await queryInterface.removeColumn("quotation_version", "send_to_engineer");
}
