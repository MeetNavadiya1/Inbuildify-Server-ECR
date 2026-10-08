"use strict";

/**
 * Flags Drive folders created by the sample-data importer.
 *
 * drive_files got the flag in 20260728130000, but the folders those files sit
 * in did not — the importer never cloned a folder at all. Now that the demo
 * account's Documents come across, the folders holding them need to be
 * identifiable as seeded so the purge can take them back out.
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
