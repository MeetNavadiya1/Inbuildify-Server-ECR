"use strict";

/**
 * Add job.color_report — a UUID FK to drive_files.file_id holding the current
 * stored colour-selection PDF for the job. Mirrors the quotation_version report
 * columns (structure_engineer_report / quotation_version_detail): the file's
 * s3_key/URL lives only in drive_files; this column is a direct pointer to the
 * active DriveFile row. ON DELETE SET NULL so removing the file just clears the
 * pointer.
 */
export async function up(queryInterface, Sequelize) {
  const table = await queryInterface.describeTable("job");
  if (!table.color_report) {
    await queryInterface.addColumn("job", "color_report", {
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
  if (table.color_report) {
    await queryInterface.removeColumn("job", "color_report");
  }
}
