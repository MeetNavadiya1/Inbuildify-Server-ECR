"use strict";

/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface, Sequelize) {
  const table = await queryInterface.describeTable("job");
  if (!table.preconstruction_closed_at) {
    await queryInterface.addColumn("job", "preconstruction_closed_at", {
      type: Sequelize.DATEONLY,
      allowNull: true,
      defaultValue: null,
    });
  }
}

export async function down(queryInterface) {
  await queryInterface.removeColumn("job", "preconstruction_closed_at");
}
