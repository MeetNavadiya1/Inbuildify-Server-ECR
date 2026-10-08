"use strict";

/**
 * Heal quotation versions that are charging for a facade they no longer have.
 *
 * `quotation_version.facade_price` is a snapshot taken when a facade is picked.
 * Until the accompanying service fix, one path cleared the facade without
 * clearing its price: changing a version's range or dwelling type nulls
 * facade_id, but that clearing ran *after* the facade_price snapshot block, so
 * the block never saw it and the old price stayed on the row.
 *
 * The charge is then invisible — there is no facade left to name anywhere on the
 * quotation — yet every grand-total expression adds
 * `COALESCE(qv.facade_price, 0)`. That is how a quotation prints a Grand Total
 * far larger than the sum of the lines above it, on the PDF, in the CRM, in the
 * quote-accepted email and in the sales/job reports alike.
 *
 * Only rows where the facade is genuinely gone are touched: facade_id IS NULL
 * and facade_price <> 0. A version that still has a facade keeps its snapshot,
 * including a deliberately edited one.
 *
 * Not reversible: the pre-fix value was a stale artefact, and restoring it would
 * only re-inflate the totals.
 */
export default {
  async up(queryInterface) {
    const tableExists = await queryInterface.tableExists("quotation_version");
    if (!tableExists) return;

    const table = await queryInterface.describeTable("quotation_version");
    if (!table.facade_price || !table.facade_id) return;

    const [rows] = await queryInterface.sequelize.query(`
      UPDATE quotation_version
      SET facade_price = 0
      WHERE facade_id IS NULL
        AND COALESCE(facade_price, 0) <> 0
      RETURNING quotation_version_id
    `);

    if (rows?.length) {
      console.log(
        `[migration] cleared orphaned facade_price on ${rows.length} quotation version(s)`,
      );
    }
  },

  async down() {
    // Intentionally irreversible — see the note above.
  },
};
