"use strict";

/**
 * Split the builder's working draft from what customers actually read.
 *
 * The editable columns on `quotation_terms` are a DRAFT — "Save draft" rewrites
 * them at will. But the public terms page falls back to those same columns
 * whenever a quotation has no frozen snapshot, so saving a draft silently
 * republished half-written wording to every un-synced quotation.
 *
 * `confirmed_snapshot` is written only by Confirm. Everything customer-facing
 * reads it; the editor keeps reading the columns.
 *
 * Backfill: rows already confirmed get their current columns copied in — those
 * columns ARE what was published for them, since nothing else could have been.
 */

export async function up(queryInterface, Sequelize) {
  const existing = await queryInterface.showAllTables();
  if (!existing.includes("quotation_terms")) return;

  const table = await queryInterface.describeTable("quotation_terms");
  if (!table.confirmed_snapshot) {
    await queryInterface.addColumn("quotation_terms", "confirmed_snapshot", {
      type: Sequelize.JSONB,
      allowNull: true,
    });
  }

  await queryInterface.sequelize.query(`
    UPDATE quotation_terms
    SET confirmed_snapshot = jsonb_build_object(
      'title', title,
      'intro', COALESCE(intro, ''),
      'sections', COALESCE(sections, '[]'::jsonb),
      'footerNote', COALESCE(footer_note, ''),
      'version', version
    )
    WHERE is_confirmed = true AND confirmed_snapshot IS NULL
  `);
}

export async function down(queryInterface) {
  const existing = await queryInterface.showAllTables();
  if (!existing.includes("quotation_terms")) return;
  const table = await queryInterface.describeTable("quotation_terms");
  if (table.confirmed_snapshot) {
    await queryInterface.removeColumn("quotation_terms", "confirmed_snapshot");
  }
}

export default { up, down };
