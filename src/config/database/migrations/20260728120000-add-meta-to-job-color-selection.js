"use strict";

export async function up(queryInterface, Sequelize) {
  const tables = await queryInterface.showAllTables();
  if (!tables.includes("job_color_selection")) return;

  const tableInfo = await queryInterface.describeTable("job_color_selection");

  if (!tableInfo.unit) {
    await queryInterface.addColumn("job_color_selection", "unit", {
      type: Sequelize.STRING(50),
      allowNull: true,
    });
  }

  if (!tableInfo.note) {
    await queryInterface.addColumn("job_color_selection", "note", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  }

  if (!tableInfo.pdf_highlight) {
    await queryInterface.addColumn("job_color_selection", "pdf_highlight", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  }
}

export async function down(queryInterface) {
  await queryInterface.removeColumn("job_color_selection", "unit");
  await queryInterface.removeColumn("job_color_selection", "note");
  await queryInterface.removeColumn("job_color_selection", "pdf_highlight");
}
