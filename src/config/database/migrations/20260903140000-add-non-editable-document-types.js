"use strict";

/**
 * Editing turned off for a whole document *type*.
 *
 * Two switches already existed and neither answers this. `editable_pdf_types`
 * says which generated PDFs offer the edit-the-record form — a narrower question
 * about *how* a document is edited, not whether it may be. `document_editable`
 * on `drive_files` is per file, which is exactly wrong when the rule is "nobody
 * edits a signed building contract, ever": an administrator would have to find
 * and lock each one, and every contract issued tomorrow would arrive unlocked.
 *
 * So: a list of reference-type keys ("BuildingContract", "Quotation", …) that
 * may not be edited, at all, by anyone.
 *
 * **A blocklist, not a whitelist, and this is the whole point.** An empty list
 * means everything is editable, which is what every tenant has today. Storing
 * the allowed types instead would mean every existing company — all of whom have
 * an empty or near-empty `editable_pdf_types` — woke up to a system where every
 * document was read-only. The default has to be the behaviour that already
 * exists.
 *
 * The per-file switch still wins over this in both directions: an administrator
 * can unlock one document of a blocked type, and can lock one document of a type
 * that is otherwise fine.
 */

const GENERAL_SETTINGS = "general_settings";
const COLUMN = "non_editable_document_types";

export async function up(queryInterface, Sequelize) {
  const existing = await queryInterface.showAllTables();
  if (!existing.includes(GENERAL_SETTINGS)) return;

  const columns = await queryInterface.describeTable(GENERAL_SETTINGS);
  if (columns[COLUMN]) return;

  await queryInterface.addColumn(GENERAL_SETTINGS, COLUMN, {
    type: Sequelize.JSON,
    allowNull: true,
    defaultValue: [],
  });
}

export async function down(queryInterface) {
  const existing = await queryInterface.showAllTables();
  if (!existing.includes(GENERAL_SETTINGS)) return;

  const columns = await queryInterface.describeTable(GENERAL_SETTINGS);
  if (columns[COLUMN]) {
    await queryInterface.removeColumn(GENERAL_SETTINGS, COLUMN);
  }
}
