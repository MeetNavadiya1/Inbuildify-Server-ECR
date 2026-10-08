import db from "../config/database/models/postgre-models/index.js";
import { grandTotalSql } from "../utils/quotationTotals.sql.js";

/**
 * Grand total of a quotation version — the figure the customer is actually
 * quoted, and the same number the QUOTE_ACCEPTED email reports.
 *
 * A naive SUM(total_price) over quotation_version_items is NOT this total: the
 * package's member rows are deliberately $0 (bundled into the package price) and
 * two further charges — structure engineer and facade — live on the version row
 * itself where no item-level sum can see them. utils/quotationTotals.sql.js is
 * the single source of truth for all of it; see its header for the full data
 * model. Compose those fragments rather than re-deriving the arithmetic here.
 *
 * @param {string} versionId quotation_version_id
 * @returns {Promise<number>} grand total, or 0 when the version has no pricing
 */
export async function getQuotationVersionGrandTotal(versionId, { transaction } = {}) {
  if (!versionId) return 0;

  const rows = await db.sequelize.query(
    `
    SELECT ${grandTotalSql("qv.quotation_version_id", "qv")} AS grand_total
    FROM quotation_version qv
    WHERE qv.quotation_version_id = :versionId
  `,
    {
      replacements: { versionId },
      type: db.Sequelize.QueryTypes.SELECT,
      transaction,
    },
  );

  return Number(rows[0]?.grand_total || 0);
}

export default { getQuotationVersionGrandTotal };
