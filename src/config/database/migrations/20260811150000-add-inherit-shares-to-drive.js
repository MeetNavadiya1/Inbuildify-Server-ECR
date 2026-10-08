"use strict";

/**
 * `inherit_shares` — does this item still take its access from the folder above?
 *
 * Sharing a folder shares everything inside it, so a file in a shared folder is
 * reachable without any share row of its own. That makes "this item is private
 * again" impossible to express by deleting shares: there is nothing to delete.
 *
 * Restoring an item from Trash sets this to FALSE, which cuts the inheritance
 * chain at that item — the folder stays shared with everyone it was shared
 * with, while the restored item itself goes back to its owner alone. Sharing it
 * again writes a direct share, which is honoured regardless of this flag; on a
 * folder, its own children keep inheriting from it.
 *
 * Everything already in the drive defaults to TRUE, so existing access is
 * unchanged by this migration.
 */

/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface, Sequelize) {
  const drive = await queryInterface.describeTable("drive");
  if (!drive.inherit_shares) {
    await queryInterface.addColumn("drive", "inherit_shares", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
  }

  const files = await queryInterface.describeTable("drive_files");
  if (!files.inherit_shares) {
    await queryInterface.addColumn("drive_files", "inherit_shares", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
  }
}

export async function down(queryInterface) {
  const drive = await queryInterface.describeTable("drive");
  if (drive.inherit_shares) await queryInterface.removeColumn("drive", "inherit_shares");

  const files = await queryInterface.describeTable("drive_files");
  if (files.inherit_shares) await queryInterface.removeColumn("drive_files", "inherit_shares");
}
