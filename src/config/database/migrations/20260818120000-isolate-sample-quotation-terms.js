"use strict";

/**
 * Give Sample Data its own Terms & Conditions document.
 *
 * `quotation_terms` was keyed one row per builder (see 20260814140000), and the
 * sample-data importer wrote the demo account's wording into THAT row. The two
 * were therefore the same document: importing sample data overwrote whatever the
 * builder had written and confirmed, and every later edit, Confirm or Sync in
 * Settings → Terms & Conditions changed the terms the demo quotations resolve
 * to — including the link printed on their PDFs.
 *
 * So a seeded document becomes a document of its own, exactly like every other
 * seeded master: flagged `is_sample_data`, attributed to the person the import
 * ran for, purged with the rest of their demo data. The builder keeps one real
 * document, and the uniqueness that guarantees it now says so — one REAL
 * document per builder, plus one seeded document per person who imported.
 *
 * `quotation_version_terms` (the frozen per-quotation copy) takes the same two
 * columns. It is reached through its quotation version by the purge, so the flag
 * is not what deletes it — it is what makes the read-only guard refuse a
 * main-account Sync that would otherwise re-freeze the builder's wording over a
 * demo quotation.
 *
 * ── Backfill ────────────────────────────────────────────────────────────────
 * Accounts that already imported sample data hold ONE document that is both.
 * Which half of its wording came from the demo account and which the builder
 * typed is no longer recorded anywhere, so nothing can un-merge it. What the
 * backfill can do — and does — is split it in two at today's contents: the demo
 * quotations keep pointing at a frozen copy, the builder keeps editing theirs,
 * and from here the two move apart instead of on top of each other.
 */

/** Stands in for NULL in a key — in SQL, NULL never equals NULL. */
const NIL = "'00000000-0000-0000-0000-000000000000'::uuid";

const TABLES = ["quotation_terms", "quotation_version_terms"];

/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface, Sequelize) {
  const existing = await queryInterface.showAllTables();
  if (!TABLES.every((table) => existing.includes(table))) return;

  const { sequelize } = queryInterface;

  // ── 1. The columns ─────────────────────────────────────────────────────────
  for (const table of TABLES) {
    const described = await queryInterface.describeTable(table);

    if (!described.is_sample_data) {
      await queryInterface.addColumn(table, "is_sample_data", {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false,
      });
    }
    if (!described.sample_data_owner_id) {
      await queryInterface.addColumn(table, "sample_data_owner_id", {
        type: Sequelize.UUID,
        allowNull: true,
      });
    }
  }

  // ── 2. Re-key uniqueness ───────────────────────────────────────────────────
  //
  // The old indexes allow exactly one document per builder, which is what makes
  // a seeded copy impossible. Replaced by the same rule stated over real
  // documents, plus a second one keying seeded documents by their owner — the
  // shape `service` and `lead_source` already took in 20260812130000.
  //
  // BEFORE the backfill, not after: the split below inserts the second document
  // per builder, and `quotation_terms_builder_uq` is precisely what would refuse
  // it. Each replacement is created before its predecessor is dropped, so the
  // table is never briefly unguarded.
  const rekey = [
    `CREATE UNIQUE INDEX IF NOT EXISTS quotation_terms_builder_real_uq
       ON quotation_terms (builder_id)
       WHERE builder_id IS NOT NULL AND is_sample_data IS NOT TRUE`,
    `CREATE UNIQUE INDEX IF NOT EXISTS quotation_terms_company_only_real_uq
       ON quotation_terms (company_id)
       WHERE builder_id IS NULL AND company_id IS NOT NULL AND is_sample_data IS NOT TRUE`,
    `CREATE UNIQUE INDEX IF NOT EXISTS quotation_terms_builder_sample_uq
       ON quotation_terms (builder_id, COALESCE(sample_data_owner_id, ${NIL}))
       WHERE builder_id IS NOT NULL AND is_sample_data = true`,
    `CREATE UNIQUE INDEX IF NOT EXISTS quotation_terms_company_only_sample_uq
       ON quotation_terms (company_id, COALESCE(sample_data_owner_id, ${NIL}))
       WHERE builder_id IS NULL AND company_id IS NOT NULL AND is_sample_data = true`,
    "DROP INDEX IF EXISTS quotation_terms_builder_uq",
    "DROP INDEX IF EXISTS quotation_terms_company_only_uq",
  ];

  for (const sql of rekey) {
    await sequelize.query(sql);
  }

  // ── 3. Flag the snapshots hanging off a seeded quotation ───────────────────
  //
  // Judged by the LEAD rather than by `quotation_version.is_sample_data`: the
  // lead has carried the flag since the first sample-data migration, so this
  // reaches pipelines seeded before the version-level flag existed too.
  await sequelize.query(`
    UPDATE quotation_version_terms qvt
       SET is_sample_data = true,
           sample_data_owner_id = COALESCE(qvt.sample_data_owner_id, l.sample_data_owner_id)
      FROM quotation_version qv
      JOIN quotation q ON q.quotation_id = qv.quotation_id
      JOIN leads l ON l.leads_id = q.leads_id
     WHERE qvt.quotation_version_id = qv.quotation_version_id
       AND l.is_sample_data = true
       AND qvt.is_sample_data IS NOT TRUE
  `);

  // ── 4. Split the shared document ───────────────────────────────────────────
  //
  // One seeded copy per (builder, importer) that holds seeded leads and has no
  // seeded document yet. It is a copy of what that builder's document says
  // TODAY, which is what those demo quotations resolve to right now — so the
  // split changes nothing a customer or the builder can see, it only stops the
  // two moving together from here on.
  //
  // `md5(...)` gives 32 hex characters, the same shape as the tokens the service
  // mints, so a backfilled document's public link is indistinguishable from one
  // the importer wrote.
  await sequelize.query(`
    INSERT INTO quotation_terms (
      quotation_terms_id, company_id, builder_id,
      title, intro, sections, footer_note, confirmed_snapshot,
      version, is_confirmed, confirmed_at, public_token, is_active,
      created_by, updated_by,
      is_sample_data, sample_data_owner_id,
      created_at, updated_at
    )
    SELECT
      gen_random_uuid(), qt.company_id, qt.builder_id,
      qt.title, qt.intro, qt.sections, qt.footer_note, qt.confirmed_snapshot,
      qt.version, qt.is_confirmed, qt.confirmed_at,
      md5(gen_random_uuid()::text || clock_timestamp()::text), qt.is_active,
      qt.created_by, qt.updated_by,
      true, owners.sample_data_owner_id,
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM (
      SELECT DISTINCT l.builder_id, l.sample_data_owner_id
        FROM leads l
       WHERE l.is_sample_data = true
         AND l.builder_id IS NOT NULL
    ) owners
    JOIN quotation_terms qt
      ON qt.builder_id = owners.builder_id
     AND qt.is_sample_data IS NOT TRUE
    WHERE NOT EXISTS (
      SELECT 1 FROM quotation_terms seeded
       WHERE seeded.builder_id = owners.builder_id
         AND seeded.is_sample_data = true
         AND seeded.sample_data_owner_id IS NOT DISTINCT FROM owners.sample_data_owner_id
    )
  `);

  // ── 5. Point the seeded snapshots at the seeded document ───────────────────
  //
  // `quotation_terms_id` is what says which document a frozen copy came from.
  // Left on the builder's row it would report the builder's revision number for
  // wording that is no longer theirs.
  await sequelize.query(`
    UPDATE quotation_version_terms qvt
       SET quotation_terms_id = seeded.quotation_terms_id
      FROM quotation_terms seeded
     WHERE qvt.is_sample_data = true
       AND seeded.is_sample_data = true
       AND seeded.builder_id IS NOT NULL
       AND seeded.builder_id = qvt.builder_id
       AND seeded.sample_data_owner_id IS NOT DISTINCT FROM qvt.sample_data_owner_id
       AND qvt.quotation_terms_id IS DISTINCT FROM seeded.quotation_terms_id
  `);

}

export async function down(queryInterface) {
  const existing = await queryInterface.showAllTables();
  if (!TABLES.every((table) => existing.includes(table))) return;

  const { sequelize } = queryInterface;

  // Going back re-imposes one document per builder, so the seeded copies cannot
  // stay — and the snapshots pointing at them would be left dangling. Both are
  // undone in the order that keeps the foreign reference valid throughout:
  // repoint first, delete second.
  await sequelize.query(`
    UPDATE quotation_version_terms qvt
       SET quotation_terms_id = real_doc.quotation_terms_id
      FROM quotation_terms seeded
      JOIN quotation_terms real_doc
        ON real_doc.builder_id = seeded.builder_id
       AND real_doc.is_sample_data IS NOT TRUE
     WHERE qvt.quotation_terms_id = seeded.quotation_terms_id
       AND seeded.is_sample_data = true
  `);

  await sequelize.query(`
    UPDATE quotation_version_terms
       SET quotation_terms_id = NULL
     WHERE quotation_terms_id IN (
       SELECT quotation_terms_id FROM quotation_terms WHERE is_sample_data = true
     )
  `);

  await sequelize.query("DELETE FROM quotation_terms WHERE is_sample_data = true");

  const statements = [
    `CREATE UNIQUE INDEX IF NOT EXISTS quotation_terms_builder_uq
       ON quotation_terms (builder_id) WHERE builder_id IS NOT NULL`,
    `CREATE UNIQUE INDEX IF NOT EXISTS quotation_terms_company_only_uq
       ON quotation_terms (company_id) WHERE builder_id IS NULL AND company_id IS NOT NULL`,
    "DROP INDEX IF EXISTS quotation_terms_builder_real_uq",
    "DROP INDEX IF EXISTS quotation_terms_company_only_real_uq",
    "DROP INDEX IF EXISTS quotation_terms_builder_sample_uq",
    "DROP INDEX IF EXISTS quotation_terms_company_only_sample_uq",
  ];

  for (const sql of statements) {
    await sequelize.query(sql);
  }

  for (const table of TABLES) {
    const described = await queryInterface.describeTable(table);
    if (described.sample_data_owner_id) {
      await queryInterface.removeColumn(table, "sample_data_owner_id");
    }
    if (described.is_sample_data) {
      await queryInterface.removeColumn(table, "is_sample_data");
    }
  }
}

export default { up, down };
