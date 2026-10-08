"use strict";

/**
 * Add job_variation.signed_document — a UUID FK to drive_files.file_id holding
 * the manually-uploaded signed variation document (the "Upload Signed Variation"
 * step in the variation status tracker). Same pattern as job.color_report: the
 * file's s3_key/URL lives only in drive_files; this column points at the active
 * DriveFile row. ON DELETE SET NULL so removing the file just clears the pointer.
 */
export async function up(queryInterface, Sequelize) {
  const table = await queryInterface.describeTable("job_variation");
  if (!table.signed_document) {
    await queryInterface.addColumn("job_variation", "signed_document", {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "drive_files", key: "file_id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });
  }
}

export async function down(queryInterface) {
  const table = await queryInterface.describeTable("job_variation");
  if (table.signed_document) {
    await queryInterface.removeColumn("job_variation", "signed_document");
  }
}
