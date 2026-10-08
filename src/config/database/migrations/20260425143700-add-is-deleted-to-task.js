"use strict";

export async function up(queryInterface, Sequelize) {
  const tableInfo = await queryInterface.describeTable("task");
  if (!tableInfo.is_deleted) {
    await queryInterface.addColumn("task", "is_deleted", {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    });
  }
}

export async function down(queryInterface, Sequelize) {
  await queryInterface.removeColumn("task", "is_deleted");
}
