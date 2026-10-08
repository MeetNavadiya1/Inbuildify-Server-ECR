"use strict";

const GENERAL_SETTINGS = "general_settings";

export async function up(queryInterface, Sequelize) {
  const existing = await queryInterface.showAllTables();
  if (!existing.includes(GENERAL_SETTINGS)) return;

  const columns = await queryInterface.describeTable(GENERAL_SETTINGS);
  if (!columns["editable_pdf_types"]) {
    await queryInterface.addColumn(GENERAL_SETTINGS, "editable_pdf_types", {
      type: Sequelize.JSON,
      allowNull: true,
      defaultValue: [],
    });
  }
}

export async function down(queryInterface) {
  const existing = await queryInterface.showAllTables();
  if (!existing.includes(GENERAL_SETTINGS)) return;

  const columns = await queryInterface.describeTable(GENERAL_SETTINGS);
  if (columns["editable_pdf_types"]) {
    await queryInterface.removeColumn(GENERAL_SETTINGS, "editable_pdf_types");
  }
}
