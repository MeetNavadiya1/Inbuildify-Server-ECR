/**
 * Per-column text-search helpers shared by the report services.
 *
 * Each list report exposes a single global `search` plus, now, a search field
 * on individual text columns. Both resolve to case-insensitive `ILIKE '%…%'`
 * matches; this centralises that so every report builds them the same way.
 */

import { sampleDataSqlScope } from "../../config/database/models/postgre-models/sampleDataFlag.js";

/** True for a filter value that should actually be applied (non-blank). */
function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

/**
 * Pushes an `<expr> ILIKE :param` clause for each provided column filter.
 *
 * @param {string[]} where              WHERE fragments to append to.
 * @param {Object}   replacements       Sequelize named replacements to fill.
 * @param {Object}   filters            The request filters.
 * @param {Object}   columnSqlByParam   Map of filter param name → SQL expression.
 *
 * Param names double as replacement keys, so they must be plain
 * `[a-z_]` identifiers (they already are — they come from the query schema).
 */
export function applyColumnSearchFilters(where, replacements, filters, columnSqlByParam) {
  for (const [param, sqlExpr] of Object.entries(columnSqlByParam)) {
    const value = filters?.[param];
    if (hasValue(value)) {
      where.push(`${sqlExpr} ILIKE :${param}`);
      replacements[param] = `%${String(value).trim()}%`;
    }
  }
}

/**
 * Narrow a report to the caller's own seeded rows.
 *
 * The demo dataset is cloned per person, so a company where two people imported
 * it holds two of every demo lead and job. Ordinary Sequelize finds are narrowed
 * by a model hook; these reports are raw SQL, so each one says so here — else
 * every figure on them is the sum of one colleague's demo pipeline and another's.
 *
 * Pass the alias the seeded table is joined under. Reports built on a child
 * table (a variation, a maintenance record, a survey response) carry no flag of
 * their own — they take the alias of the job or lead they hang off, which is
 * what made them sample data in the first place.
 *
 * @param {string[]} where        WHERE fragments to append to.
 * @param {Object}   replacements Sequelize named replacements to fill.
 * @param {...string} aliases     Table aliases to scope, e.g. "j", "l".
 */
export function applySampleDataScope(where, replacements, ...aliases) {
  for (const alias of aliases) {
    const scope = sampleDataSqlScope(alias);
    if (!scope.sql) continue;
    where.push(scope.sql);
    Object.assign(replacements, scope.replacements);
  }
}
