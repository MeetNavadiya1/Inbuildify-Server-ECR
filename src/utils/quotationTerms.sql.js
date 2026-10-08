/**
 * SQL fragments that resolve a quotation's Terms & Conditions.
 *
 * Shared by every quotation query that needs the link (the details query behind
 * all five PDF paths, the public quotation view, and the quotation list) so the
 * three cannot drift apart.
 *
 * ── Why scalar subqueries and not a LEFT JOIN ────────────────────────────────
 * A join on (builder_id, company_id) is wrong twice over:
 *
 *   1. authMiddleware RESOLVES company_id from the builder when the user's own
 *      company_id is NULL, so the terms row can carry a company_id that the
 *      tenant's `leads` rows do not. Equality then matches nothing and the link
 *      silently disappears.
 *   2. Loosening it to "builder OR company" lets a builder-scoped document and
 *      a company-wide one both match the same lead — and a LEFT JOIN that
 *      matches twice DUPLICATES the quotation row, quietly corrupting the
 *      caller's result set.
 *
 * A scalar subquery can never multiply rows, and the ORDER BY makes the pick
 * deterministic: the builder's own document wins over a company-wide one, and
 * the most recently updated wins a tie.
 *
 * Matching is deliberately asymmetric to avoid NULL-matches-NULL leaking across
 * tenants: a document WITH a builder matches only that builder; a document with
 * NO builder matches only by a non-NULL company.
 */

/**
 * Which of the tenant's documents this quotation may resolve to.
 *
 * A builder holds their own document and — once they have imported Sample Data —
 * a seeded one per importer. They are two separate documents on purpose, so the
 * pick has to be exact rather than "whichever this builder has": a seeded
 * quotation resolves to the seeded document belonging to the same import, and
 * everything else resolves to the builder's own.
 *
 * Without this a demo quotation's PDF printed, and its link opened, whatever the
 * builder had last confirmed in Settings → Terms & Conditions — so editing the
 * real document silently rewrote the demo one.
 *
 * `IS NOT DISTINCT FROM` rather than `=` on the owner: seeded rows written
 * before the owner column existed carry NULL, and `NULL = NULL` is NULL, which
 * would leave those demo quotations resolving to nothing at all.
 */
const sampleDataMatch = (leadsAlias) => `(
  CASE WHEN ${leadsAlias}.is_sample_data IS TRUE
    THEN qt_pick.is_sample_data IS TRUE
      AND qt_pick.sample_data_owner_id IS NOT DISTINCT FROM ${leadsAlias}.sample_data_owner_id
    ELSE qt_pick.is_sample_data IS NOT TRUE
  END
)`;

/**
 * @param {string} leadsAlias the alias the caller uses for the `leads` table.
 * @param {string} selectExpr a full SELECT expression over the `qt_pick` alias
 *   (not just a column name — some callers need a COALESCE over two columns).
 */
const confirmedTermsFor = (leadsAlias, selectExpr) => `(
  SELECT ${selectExpr}
  FROM quotation_terms qt_pick
  WHERE qt_pick.is_active = true
    AND qt_pick.is_confirmed = true
    AND ${sampleDataMatch(leadsAlias)}
    AND (
      (qt_pick.builder_id IS NOT NULL AND qt_pick.builder_id = ${leadsAlias}.builder_id)
      OR (qt_pick.builder_id IS NULL AND qt_pick.company_id IS NOT NULL AND qt_pick.company_id = ${leadsAlias}.company_id)
    )
  ORDER BY (qt_pick.builder_id IS NOT NULL) DESC, qt_pick.updated_at DESC
  LIMIT 1
)`;

/**
 * The token for the public terms page.
 *
 * The per-quotation snapshot's token wins: it resolves to the exact wording the
 * customer was sent. The builder's live document is the fallback, so a
 * quotation that was never synced still prints a working link instead of none.
 *
 * @param {string} versionAlias alias for `quotation_version`
 * @param {string} leadsAlias   alias for `leads`
 */
export const termsTokenSql = (versionAlias, leadsAlias) => `COALESCE(
  (SELECT qvt_pick.public_token FROM quotation_version_terms qvt_pick
    WHERE qvt_pick.quotation_version_id = ${versionAlias}.quotation_version_id LIMIT 1),
  ${confirmedTermsFor(leadsAlias, "qt_pick.public_token")}
)`;

/**
 * Document heading — the quotation's frozen snapshot first, then the builder's
 * PUBLISHED title.
 *
 * `confirmed_snapshot->>'title'` before the plain `title` column: the column is
 * the builder's working draft and may hold a heading they have not published,
 * which must never print on a customer's PDF.
 */
export const termsTitleSql = (versionAlias, leadsAlias) => `COALESCE(
  (SELECT qvt_pick.terms_snapshot->>'title' FROM quotation_version_terms qvt_pick
    WHERE qvt_pick.quotation_version_id = ${versionAlias}.quotation_version_id LIMIT 1),
  ${confirmedTermsFor(leadsAlias, "COALESCE(qt_pick.confirmed_snapshot->>'title', qt_pick.title)")}
)`;

/** True when Sync has frozen terms onto this quotation version. */
export const termsIsSyncedSql = (versionAlias) => `EXISTS (
  SELECT 1 FROM quotation_version_terms qvt_ex
  WHERE qvt_ex.quotation_version_id = ${versionAlias}.quotation_version_id
)`;

export default { termsTokenSql, termsTitleSql, termsIsSyncedSql };
