"use strict";

export async function up(queryInterface, Sequelize) {
  const tableInfo = await queryInterface.describeTable("appointment");
  if (!tableInfo.link_type) {
    await queryInterface.addColumn("appointment", "link_type", {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
  }
}

export async function down(queryInterface) {
  await queryInterface.removeColumn("appointment", "link_type");
}
