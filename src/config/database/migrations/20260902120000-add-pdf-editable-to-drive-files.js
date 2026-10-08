"use strict";

/**
 * Per-file "may this PDF be edited?" flag, set by an admin.
 *
 * Until now editability was decided only by `general_settings.editable_pdf_types`
 * — a company-wide list of document *types*. That cannot express "this one
 * signed contract is locked but the rest of the contracts are not", which is
 * what Admin → PDF Management offers.
 *
 * Nullable on purpose: NULL means "no admin has ruled on this file", so it keeps
 * falling back to the type-level setting. Only an explicit TRUE/FALSE overrides
 * it, which is what lets the new screen adopt the existing configuration instead
 * of silently locking or unlocking every file already in the system.
 */

const DRIVE_FILES = "drive_files";

export async function up(queryInterface, Sequelize) {
  const existing = await queryInterface.showAllTables();
  if (!existing.includes(DRIVE_FILES)) return;

  const columns = await queryInterface.describeTable(DRIVE_FILES);

  if (!columns["pdf_editable"]) {
    await queryInterface.addColumn(DRIVE_FILES, "pdf_editable", {
      type: Sequelize.BOOLEAN,
      allowNull: true,
      defaultValue: null,
    });
  }

  // Who last ruled on it, and when — an admin turning editing off on a signed
  // document is exactly the kind of decision someone asks about later.
  if (!columns["pdf_editable_updated_by"]) {
    await queryInterface.addColumn(DRIVE_FILES, "pdf_editable_updated_by", {
      type: Sequelize.UUID,
      allowNull: true,
    });
  }

  if (!columns["pdf_editable_updated_at"]) {
    await queryInterface.addColumn(DRIVE_FILES, "pdf_editable_updated_at", {
      type: Sequelize.DATE,
      allowNull: true,
    });
  }

  // The management screen lists one company's PDFs newest-first and filters on
  // the flag; without this it is a sequential scan of every file in the tenant.
  const indexes = await queryInterface.showIndex(DRIVE_FILES);
  if (!indexes.some((index) => index.name === "drive_files_company_pdf_editable_idx")) {
    await queryInterface.addIndex(DRIVE_FILES, {
      name: "drive_files_company_pdf_editable_idx",
      fields: ["company_id", "pdf_editable"],
    });
  }
}

export async function down(queryInterface) {
  const existing = await queryInterface.showAllTables();
  if (!existing.includes(DRIVE_FILES)) return;

  const indexes = await queryInterface.showIndex(DRIVE_FILES);
  if (indexes.some((index) => index.name === "drive_files_company_pdf_editable_idx")) {
    await queryInterface.removeIndex(DRIVE_FILES, "drive_files_company_pdf_editable_idx");
  }

  const columns = await queryInterface.describeTable(DRIVE_FILES);
  for (const column of ["pdf_editable_updated_at", "pdf_editable_updated_by", "pdf_editable"]) {
    if (columns[column]) await queryInterface.removeColumn(DRIVE_FILES, column);
  }
}
