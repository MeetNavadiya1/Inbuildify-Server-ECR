"use strict";

export async function up(queryInterface, Sequelize) {
  const tableInfo = await queryInterface.describeTable("notes");
  if (!tableInfo.link_type) {
    await queryInterface.addColumn("notes", "link_type", {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
  }
}

export async function down(queryInterface) {
  await queryInterface.removeColumn("notes", "link_type");
}
