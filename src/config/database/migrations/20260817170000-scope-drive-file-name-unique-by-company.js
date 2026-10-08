"use strict";

/**
 * Stop one company's file name from reserving that name for every other company.
 *
 * `drive_files.file_name` was declared `unique: true` on the model, which makes
 * Postgres key it across the WHOLE table — every tenant, every folder, every
 * seeded row together. The names are built from an administrator-configured
 * format that renders things like `LD20260002-Facade-2026-08-17.jpg`: a lead
 * number, what the file is, and the date. Lead numbers restart per company and
 * the sample-data importer clones the same demo lead into every account, so two
 * companies producing the same name is not an edge case — it is the norm.
 *
 * What that cost:
 *
 *   - A quotation version in one company failed to save with a bare 23505 once
 *     another company — or another user's seeded copy — already held the name.
 *     The clone is written in a single `bulkCreate` inside the version's
 *     transaction, so the whole save rolled back.
 *   - `ensureUniqueDriveFileName` papered over the rest by appending `-2`, `-3`
 *     … Of 1983 rows in this database, 1677 carry such a suffix: 85% of every
 *     file in S Drive is named after a collision with somebody else's tenant.
 *
 * Neither is uniqueness anybody asked for. A file name has to be unambiguous
 * inside the company that owns it; what a different tenant calls its files is
 * not this company's business.
 *
 * Deliberately NOT partial on `deleted_at`. The global key covered soft-deleted
 * rows and `ensureUniqueDriveFileName` probes with `paranoid: false` to match —
 * a file in Trash keeps its name reserved, which is what lets it be restored
 * without colliding with something created in the meantime. Only the scope
 * changes here; the treatment of deleted rows stays exactly as it was.
 *
 * The old key is dropped by definition rather than by name: `sync()` adds a
 * fresh auto-named `drive_files_file_name_keyN` every time it runs against a
 * model carrying `unique: true`, and this database had accumulated four
 * (`_key`, `_key1`, `_key2`, `_key3`). Naming them individually would leave
 * behind whichever ones the next environment happens to have.
 */

const NEW_INDEX = "drive_files_company_file_name_active_unique";

/** Every single-column UNIQUE on file_name, whatever sync() called it. */
const FIND_GLOBAL_UNIQUES = `
  SELECT conname
    FROM pg_constraint
   WHERE conrelid = 'drive_files'::regclass
     AND contype = 'u'
     AND pg_get_constraintdef(oid) = 'UNIQUE (file_name)'
`;

export async function up(queryInterface) {
  const TAG = "[scope-drive-file-name-unique-by-company]";
  const { sequelize } = queryInterface;

  const existing = await queryInterface.showAllTables();
  if (!existing.includes("drive_files")) return;

  // Refuse rather than half-apply: creating the new key on data that already
  // breaks it fails partway and leaves the table with no uniqueness at all.
  const [dupes] = await sequelize.query(`
    SELECT company_id, file_name, COUNT(*)::int AS n
      FROM drive_files
     GROUP BY company_id, file_name
    HAVING COUNT(*) > 1
     LIMIT 5
  `);
  if (dupes.length > 0) {
    const sample = dupes.map((d) => `${d.file_name} (x${d.n})`).join(", ");
    throw new Error(
      `${TAG} drive_files already holds duplicate (company_id, file_name) rows — ` +
      `${sample}. Resolve these before scoping the key.`,
    );
  }

  const [globals] = await sequelize.query(FIND_GLOBAL_UNIQUES);

  // New key first, old keys second: for the moment between the two statements
  // the table is over-constrained rather than unconstrained, so nothing can slip
  // a duplicate in while the migration runs.
  await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "${NEW_INDEX}"
        ON drive_files (company_id, file_name)
  `);
  console.log(`${TAG} created ${NEW_INDEX} (company_id, file_name)`);

  for (const { conname } of globals) {
    await sequelize.query(`ALTER TABLE drive_files DROP CONSTRAINT IF EXISTS "${conname}"`);
    console.log(`${TAG} dropped global unique ${conname}`);
  }

  if (globals.length === 0) console.log(`${TAG} no global file_name unique found — nothing to drop`);
}

export async function down(queryInterface) {
  const { sequelize } = queryInterface;

  const existing = await queryInterface.showAllTables();
  if (!existing.includes("drive_files")) return;

  // Only restorable while no two companies share a name — which is precisely
  // what this migration allows, so a rollback after the fact can legitimately
  // fail. Say so rather than dropping the scoped key and leaving nothing.
  const [clashes] = await sequelize.query(`
    SELECT file_name FROM drive_files
     GROUP BY file_name HAVING COUNT(*) > 1 LIMIT 5
  `);
  if (clashes.length > 0) {
    throw new Error(
      "[scope-drive-file-name-unique-by-company] cannot restore the global unique: " +
      `${clashes.length} file name(s) are now used by more than one company, ` +
      `e.g. ${clashes.map((c) => c.file_name).join(", ")}.`,
    );
  }

  await sequelize.query(`
    ALTER TABLE drive_files
      ADD CONSTRAINT drive_files_file_name_key UNIQUE (file_name)
  `);
  await sequelize.query(`DROP INDEX IF EXISTS "${NEW_INDEX}"`);
}
