"use strict";

export async function up(queryInterface, Sequelize) {
  const table = await queryInterface.describeTable("job");
  if (!table.color_approved_at) {
    await queryInterface.addColumn("job", "color_approved_at", {
      type: Sequelize.DATEONLY,
      allowNull: true,
    });
  }
}

export async function down(queryInterface) {
  await queryInterface.removeColumn("job", "color_approved_at");
}
