"use strict";

/**
 * Sample-data flag on the S Drive folder table.
 *
 * 20260728130000 flagged drive_files but not `drive`, so the importer had no way
 * to mark the folders it clones and the purge had no way to tell a seeded folder
 * from one the builder created. Both are needed now that the sample-data import
 * reproduces the demo company's My Drive tree.
 */
export async function up(queryInterface, Sequelize) {
  const described = await queryInterface.describeTable("drive");
  if (described.is_sample_data) return;

  await queryInterface.addColumn("drive", "is_sample_data", {
    type: Sequelize.BOOLEAN,
    defaultValue: false,
    allowNull: false,
  });
}

export async function down(queryInterface) {
  const described = await queryInterface.describeTable("drive");
  if (!described.is_sample_data) return;

  await queryInterface.removeColumn("drive", "is_sample_data");
}
