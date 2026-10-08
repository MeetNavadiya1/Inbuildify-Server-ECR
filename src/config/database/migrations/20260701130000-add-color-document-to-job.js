"use strict";

/**
 * Add job.color_document — a UUID FK to drive_files.file_id holding the current
 * stored "Colour Schedule" document PDF for the job. Same pattern as
 * job.color_report (the colour-selection report): the file's s3_key/URL lives
 * only in drive_files; this column is a direct pointer to the active row.
 * ON DELETE SET NULL so removing the file just clears the pointer.
 */
export async function up(queryInterface, Sequelize) {
  const table = await queryInterface.describeTable("job");
  if (!table.color_document) {
    await queryInterface.addColumn("job", "color_document", {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "drive_files", key: "file_id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });
  }
}

export async function down(queryInterface) {
  const table = await queryInterface.describeTable("job");
  if (table.color_document) {
    await queryInterface.removeColumn("job", "color_document");
  }
}
