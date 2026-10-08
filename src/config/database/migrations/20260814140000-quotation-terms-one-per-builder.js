"use strict";

/**
 * One Terms & Conditions document per builder — enforced, not just intended.
 *
 * The original unique index keyed on (builder_id, company_id). That pair is not
 * stable: authMiddleware resolves company_id from the builder when the user's
 * own company_id is NULL, so the same builder could key TWO documents (one
 * written with a NULL company, one with the resolved company) and the quotation
 * queries would then have to pick between rival documents. Keying on the
 * builder removes the ambiguity at the source.
 *
 * Two PARTIAL unique indexes rather than one composite:
 *   - a document WITH a builder is unique per builder, whatever its company_id
 *   - a document with NO builder (Company Administrators created via
 *     /company-signup, who have no builder at all) is unique per company
 *
 * Duplicates are merged before the index is created: the most recently updated
 * row per builder wins, since that is the one the builder has been editing.
 * Confirmed documents beat drafts regardless of date — a published document is
 * the one customers may already be reading, and losing it would break links.
 * Any snapshot rows pointing at a discarded document are repointed at the
 * survivor so no quotation is left with a dangling reference.
 */

export async function up(queryInterface) {
  const existing = await queryInterface.showAllTables();
  if (!existing.includes("quotation_terms")) return;

  const sequelize = queryInterface.sequelize;

  // ── 1. Repoint snapshots away from the rows about to be discarded ──────────
  await sequelize.query(`
    WITH ranked AS (
      SELECT quotation_terms_id, builder_id,
             FIRST_VALUE(quotation_terms_id) OVER (
               PARTITION BY builder_id
               ORDER BY is_confirmed DESC, version DESC, updated_at DESC
             ) AS keeper
      FROM quotation_terms
      WHERE builder_id IS NOT NULL
    )
    UPDATE quotation_version_terms qvt
    SET quotation_terms_id = ranked.keeper
    FROM ranked
    WHERE qvt.quotation_terms_id = ranked.quotation_terms_id
      AND ranked.quotation_terms_id <> ranked.keeper
  `);

  // ── 2. Drop the losers ────────────────────────────────────────────────────
  await sequelize.query(`
    WITH ranked AS (
      SELECT quotation_terms_id,
             ROW_NUMBER() OVER (
               PARTITION BY builder_id
               ORDER BY is_confirmed DESC, version DESC, updated_at DESC
             ) AS rn
      FROM quotation_terms
      WHERE builder_id IS NOT NULL
    )
    DELETE FROM quotation_terms
    WHERE quotation_terms_id IN (SELECT quotation_terms_id FROM ranked WHERE rn > 1)
  `);

  await sequelize.query(`
    WITH ranked AS (
      SELECT quotation_terms_id,
             ROW_NUMBER() OVER (
               PARTITION BY company_id
               ORDER BY is_confirmed DESC, version DESC, updated_at DESC
             ) AS rn
      FROM quotation_terms
      WHERE builder_id IS NULL AND company_id IS NOT NULL
    )
    DELETE FROM quotation_terms
    WHERE quotation_terms_id IN (SELECT quotation_terms_id FROM ranked WHERE rn > 1)
  `);

  // ── 3. Swap the constraint ────────────────────────────────────────────────
  await sequelize.query(`DROP INDEX IF EXISTS quotation_terms_tenant_uq`);
  await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS quotation_terms_builder_uq
      ON quotation_terms (builder_id) WHERE builder_id IS NOT NULL
  `);
  await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS quotation_terms_company_only_uq
      ON quotation_terms (company_id) WHERE builder_id IS NULL AND company_id IS NOT NULL
  `);
}

export async function down(queryInterface) {
  const sequelize = queryInterface.sequelize;
  await sequelize.query(`DROP INDEX IF EXISTS quotation_terms_builder_uq`);
  await sequelize.query(`DROP INDEX IF EXISTS quotation_terms_company_only_uq`);
}

export default { up, down };
