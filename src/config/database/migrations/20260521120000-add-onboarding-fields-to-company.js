"use strict";

export async function up(queryInterface, Sequelize) {
  const tableInfo = await queryInterface.describeTable("company");

  if (!tableInfo.is_onboarding_finished) {
    await queryInterface.addColumn("company", "is_onboarding_finished", {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    });
  }
}

export async function down(queryInterface) {
  const tableInfo = await queryInterface.describeTable("company");

  if (tableInfo.is_onboarding_finished) {
    await queryInterface.removeColumn("company", "is_onboarding_finished");
  }
}
