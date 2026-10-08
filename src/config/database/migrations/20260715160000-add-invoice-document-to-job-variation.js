"use strict";

/**
 * Add job_variation.invoice_document — a UUID FK to drive_files.file_id holding
 * the generated invoice PDF sent to the customer at the "Send Invoice to
 * Customer" step of the variation status tracker. Same pattern as
 * job_variation.signed_document and job.color_report: the s3_key/URL lives only
 * in drive_files and this column points at the active DriveFile row. Re-sending
 * replaces the file, so there is at most one invoice document per variation.
 * ON DELETE SET NULL so removing the file just clears the pointer.
 */
export async function up(queryInterface, Sequelize) {
  const table = await queryInterface.describeTable("job_variation");
  if (!table.invoice_document) {
    await queryInterface.addColumn("job_variation", "invoice_document", {
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
  if (table.invoice_document) {
    await queryInterface.removeColumn("job_variation", "invoice_document");
  }
}
