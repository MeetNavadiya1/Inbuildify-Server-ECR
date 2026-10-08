"use strict";

/**
 * Sample-data purge (Settings → Sample Data) has to delete the catalog rows the
 * onboarding importer created, without touching rows the builder made or edited.
 * The importer matches by name and reuses anything that already exists, so name
 * is not a safe discriminator — each seeded row carries this flag instead.
 *
 * Mirrors leads.is_sample_data (migration 20260727180000).
 */
const TABLES = [
  "location",
  "range",
  "dwelling_type",
  "package",
  "price_list",
  "price_list_item",
  "facade",
  "floor_plan",
];

/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface, Sequelize) {
  for (const table of TABLES) {
    const described = await queryInterface.describeTable(table);
    if (described.is_sample_data) continue;

    await queryInterface.addColumn(table, "is_sample_data", {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    });
  }
}

export async function down(queryInterface) {
  for (const table of TABLES) {
    const described = await queryInterface.describeTable(table);
    if (!described.is_sample_data) continue;

    await queryInterface.removeColumn(table, "is_sample_data");
  }
}
