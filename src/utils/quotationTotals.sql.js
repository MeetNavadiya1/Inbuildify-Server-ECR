/**
 * Canonical SQL for quotation-version money.
 *
 * The three figures a quotation is made of used to be hand-copied into nine
 * different queries (quotation.repository ×5, quotationTotal.helper, the
 * quote-approved worker + processor, and three report services). Any fix to one
 * silently left the other eight wrong, which is how the PDF, the CRM screen and
 * the reports drifted apart. Every caller now composes these fragments instead.
 *
 * ── The data model these expressions encode ─────────────────────────────────
 * `quotation_version_items` holds three kinds of row:
 *
 *   1. package summary   package_id NOT NULL, price_list_item_id NULL
 *                        carries the package price in BOTH package_cost and
 *                        total_price
 *   2. package member    package_id NOT NULL, price_list_item_id NOT NULL
 *                        total_price = 0 — it is bundled into (1), charging it
 *                        again would double-count. package_cost is a *copy* of
 *                        the package price, NOT this row's price.
 *   3. price-list line   package_id NULL, total_price = quantity × unit cost
 *                        (extras/discounts are this kind too; a discount simply
 *                        carries a negative total_price)
 *
 * So the package is charged once via (1) and the inclusions are SUM(total_price)
 * over (3) — which is exactly why the pricelist sum filters on package_id IS
 * NULL. Two further charges live on `quotation_version` itself and no
 * item-level sum can see them: the structure engineer and the facade.
 *
 * ── Why the package fragment is not `SELECT DISTINCT … LIMIT 1` ─────────────
 * The old expression was `SELECT DISTINCT package_cost … AND package_id IS NOT
 * NULL LIMIT 1`. Rows (1) and (2) all carry the same package_cost, so it
 * *usually* worked — but `LIMIT` without `ORDER BY` is unordered in Postgres, so
 * the moment a version holds two different package_cost values (a stale member
 * row left behind by a package swap, an item copied by duplicateVersion, a
 * legacy row) the same query could return a different number on consecutive
 * runs. Ordering the summary row first makes it deterministic and pins the
 * figure to the row that actually represents the package.
 *
 * ── Usage ───────────────────────────────────────────────────────────────────
 * Every fragment takes the SQL expression that yields the version id — an alias
 * column (`qv.quotation_version_id`, `j.quotation_version_id`) or a bind
 * parameter (`:versionId`). `grandTotalSql` additionally takes the alias of the
 * `quotation_version` row that owns structure_engineer_price / facade_price,
 * because some report queries read the items through a job FK but the charges
 * through a joined version alias.
 *
 * All fragments return a NUMERIC and are `COALESCE`d, so they are never NULL and
 * can be summed/cast by the caller.
 */

/** Value of the selected package (0 when the version has no package). */
export const packageCostSql = (versionIdExpr = "qv.quotation_version_id") => `COALESCE((
    SELECT qvi_pkg.package_cost
    FROM quotation_version_items qvi_pkg
    WHERE qvi_pkg.quotation_version_id = ${versionIdExpr}
      AND qvi_pkg.package_id IS NOT NULL
    ORDER BY (CASE WHEN qvi_pkg.price_list_item_id IS NULL THEN 0 ELSE 1 END),
             qvi_pkg.created_at ASC
    LIMIT 1
  ), 0)`;

/**
 * Value of the inclusions — every price-list line, extra and discount that is
 * not bundled inside the package.
 */
export const priceListCostSql = (versionIdExpr = "qv.quotation_version_id") => `COALESCE((
    SELECT SUM(qvi_pl.total_price)
    FROM quotation_version_items qvi_pl
    WHERE qvi_pl.quotation_version_id = ${versionIdExpr}
      AND qvi_pl.package_id IS NULL
  ), 0)`;

/**
 * The figure the customer is quoted: package + inclusions + structure engineer
 * + facade.
 *
 * @param {string} versionIdExpr  SQL yielding the quotation_version_id
 * @param {string} versionAlias   alias of the quotation_version row carrying
 *                                structure_engineer_price / facade_price
 */
export const grandTotalSql = (
  versionIdExpr = "qv.quotation_version_id",
  versionAlias = "qv",
) => `(
    ${packageCostSql(versionIdExpr)}
    + ${priceListCostSql(versionIdExpr)}
    + COALESCE(${versionAlias}.structure_engineer_price, 0)
    + COALESCE(${versionAlias}.facade_price, 0)
  )`;

/** Same three figures, cast to `numeric(12,2)::text` for JSON-safe transport. */
export const packageCostTextSql = (versionIdExpr) =>
  `(${packageCostSql(versionIdExpr)})::numeric(12,2)::text`;
export const priceListCostTextSql = (versionIdExpr) =>
  `(${priceListCostSql(versionIdExpr)})::numeric(12,2)::text`;
export const grandTotalTextSql = (versionIdExpr, versionAlias) =>
  `(${grandTotalSql(versionIdExpr, versionAlias)})::numeric(12,2)::text`;

export default {
  packageCostSql,
  priceListCostSql,
  grandTotalSql,
  packageCostTextSql,
  priceListCostTextSql,
  grandTotalTextSql,
};
