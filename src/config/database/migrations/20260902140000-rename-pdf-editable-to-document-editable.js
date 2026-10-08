"use strict";

/**
 * Widen the per-file editing switch from PDFs to every editable document.
 *
 * The column shipped as `pdf_editable` when Admin → PDF Management only listed
 * PDFs. It now governs spreadsheets and Word documents too, so the name is
 * wrong; Admin → Document Management is the one place that sets it and the one
 * answer every write path asks for.
 *
 * Written to work from either starting point, because the first migration may
 * not have been applied yet: rename when the old column is there, create when it
 * is not, and do nothing when the new one already exists.
 */

const DRIVE_FILES = "drive_files";

const RENAMES = [
  ["pdf_editable", "document_editable"],
  ["pdf_editable_updated_by", "document_editable_updated_by"],
  ["pdf_editable_updated_at", "document_editable_updated_at"],
];

const OLD_INDEX = "drive_files_company_pdf_editable_idx";
const NEW_INDEX = "drive_files_company_document_editable_idx";

export async function up(queryInterface, Sequelize) {
  const existing = await queryInterface.showAllTables();
  if (!existing.includes(DRIVE_FILES)) return;

  let columns = await queryInterface.describeTable(DRIVE_FILES);

  for (const [from, to] of RENAMES) {
    if (columns[to]) continue;
    if (columns[from]) {
      await queryInterface.renameColumn(DRIVE_FILES, from, to);
    }
  }

  // Anything still missing is created from scratch — the path taken when the
  // PDF-only migration never ran.
  columns = await queryInterface.describeTable(DRIVE_FILES);

  if (!columns["document_editable"]) {
    await queryInterface.addColumn(DRIVE_FILES, "document_editable", {
      type: Sequelize.BOOLEAN,
      allowNull: true,
      defaultValue: null,
    });
  }
  if (!columns["document_editable_updated_by"]) {
    await queryInterface.addColumn(DRIVE_FILES, "document_editable_updated_by", {
      type: Sequelize.UUID,
      allowNull: true,
    });
  }
  if (!columns["document_editable_updated_at"]) {
    await queryInterface.addColumn(DRIVE_FILES, "document_editable_updated_at", {
      type: Sequelize.DATE,
      allowNull: true,
    });
  }

  const indexes = await queryInterface.showIndex(DRIVE_FILES);
  if (indexes.some((index) => index.name === OLD_INDEX)) {
    await queryInterface.removeIndex(DRIVE_FILES, OLD_INDEX);
  }
  if (!indexes.some((index) => index.name === NEW_INDEX)) {
    // The management screen lists one company's documents newest-first and
    // filters on the switch; without this it is a sequential scan of the tenant.
    await queryInterface.addIndex(DRIVE_FILES, {
      name: NEW_INDEX,
      fields: ["company_id", "document_editable"],
    });
  }
}

export async function down(queryInterface) {
  const existing = await queryInterface.showAllTables();
  if (!existing.includes(DRIVE_FILES)) return;

  const indexes = await queryInterface.showIndex(DRIVE_FILES);
  if (indexes.some((index) => index.name === NEW_INDEX)) {
    await queryInterface.removeIndex(DRIVE_FILES, NEW_INDEX);
  }

  const columns = await queryInterface.describeTable(DRIVE_FILES);
  for (const [from, to] of RENAMES) {
    if (columns[to] && !columns[from]) {
      await queryInterface.renameColumn(DRIVE_FILES, to, from);
    }
  }
}
