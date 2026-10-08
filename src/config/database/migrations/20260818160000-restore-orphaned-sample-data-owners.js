"use strict";

/**
 * Give back the seeded rows a re-sync detached from their owner.
 *
 * `sample_data_owner_id` is what makes a seeded row belong to somebody. Every
 * read of sample data goes through it: `scopeToViewer` shows a flagged row only
 * to the user named in that column, Settings → Sample Data counts by it, the
 * purge sweeps by it, and the importer looks a row up by it before deciding
 * whether to reuse or clone.
 *
 * The importer's refresh pass used to write over it. Re-syncing a record it had
 * brought across before means spreading the demo account's row onto this
 * company's copy — `target.update({ ...source.get({ plain: true }) })` — and the
 * demo account's own records are not sample data, so their owner column is NULL.
 * That NULL went straight over the owner the first import had stamped, and
 * nothing put it back: the owner was stamped by a `beforeCreate` hook, and this
 * was an update.
 *
 * A row left that way is flagged as sample data and belongs to nobody, which is
 * the worst of both worlds. It is hidden from every user including the one it
 * was imported for, counted for nobody, unreachable by the purge that would
 * clear it, and invisible to the next sync — which then clones a second copy
 * beside it. To the builder, pressing Sync simply emptied their sample catalog.
 *
 * `sampleDataFlag.js` now holds the owner across updates, so no new row is
 * orphaned. The rows already orphaned still need their owner back, which is what
 * this does.
 *
 * The owner is not guessed. A builder is repaired only when every seeded row
 * that still names an owner names the SAME one — then there is exactly one
 * account the orphans can belong to and no judgement is involved. A builder
 * whose sample data is shared between two people, or whose rows are all
 * orphaned and offer nothing to key on, is left exactly as it is and reported.
 */

/**
 * Tables consulted for "whose sample data is this?".
 *
 * Two kinds, both chosen because their owner survived the bug. The first are
 * cloned per person, so they are present whenever anybody holds sample data at
 * all. The second are the settings masters, which the importer copies through
 * `cloneMasterRows` — that helper re-stamps the owner after the spread, which is
 * precisely what the hand-written passes forgot to do.
 */
const OWNER_ANCHORS = [
  "leads",
  "job",
  "users",
  "task",
  "appointment",
  "todo",
  "package_group",
  "color",
  "supplier",
  "estate",
  "cost_center",
];

/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface) {
  const { sequelize } = queryInterface;

  const existing = new Set(await queryInterface.showAllTables());

  /** Tables carrying the flag, the owner and a builder to group them by. */
  const [seededTables] = await sequelize.query(`
    SELECT table_name
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND column_name IN ('is_sample_data', 'sample_data_owner_id', 'builder_id')
     GROUP BY table_name
    HAVING count(DISTINCT column_name) = 3
     ORDER BY table_name
  `);

  const repairable = seededTables
    .map((row) => row.table_name)
    .filter((table) => existing.has(table));

  if (repairable.length === 0) return;

  const anchors = OWNER_ANCHORS.filter((table) => repairable.includes(table));
  if (anchors.length === 0) {
    console.log(
      "[restore-orphaned-sample-data-owners] No table to read ownership from; nothing repaired.",
    );
    return;
  }

  // One row per builder: who its seeded data belongs to, and how many different
  // answers there are. More than one and this migration has nothing to say.
  const [candidates] = await sequelize.query(`
    WITH owners AS (
      ${anchors
    .map(
      (table) => `SELECT DISTINCT builder_id, sample_data_owner_id
                      FROM "${table}"
                     WHERE is_sample_data = true
                       AND sample_data_owner_id IS NOT NULL
                       AND builder_id IS NOT NULL`,
    )
    .join("\n      UNION\n      ")}
    )
    SELECT builder_id,
           -- Postgres has no min(uuid); the array is only ever read at [1], and
           -- only when it holds exactly one element.
           (array_agg(DISTINCT sample_data_owner_id))[1] AS owner_id,
           count(DISTINCT sample_data_owner_id)::int     AS owner_count
      FROM owners
     GROUP BY builder_id
  `);

  const soleOwner = new Map(
    candidates.filter((row) => row.owner_count === 1).map((row) => [row.builder_id, row.owner_id]),
  );

  const shared = candidates.filter((row) => row.owner_count > 1).map((row) => row.builder_id);

  let repaired = 0;
  const perTable = [];

  for (const table of repairable) {
    let touched = 0;

    for (const [builderId, ownerId] of soleOwner) {
      const [, result] = await sequelize.query(
        `UPDATE "${table}"
            SET sample_data_owner_id = :ownerId
          WHERE is_sample_data = true
            AND sample_data_owner_id IS NULL
            AND builder_id = :builderId`,
        { replacements: { ownerId, builderId } },
      );
      touched += result?.rowCount ?? 0;
    }

    if (touched > 0) {
      perTable.push(`${table}=${touched}`);
      repaired += touched;
    }
  }

  if (repaired > 0) {
    console.log(
      `[restore-orphaned-sample-data-owners] Re-attached ${repaired} orphaned row(s): ` +
        perTable.join(", "),
    );
  }

  // Said out loud rather than left as a silent gap. These rows are still there,
  // still invisible, and this migration is deliberately not the thing that
  // decides who they belong to.
  const [remaining] = await sequelize.query(`
    SELECT count(*)::int AS n
      FROM (
        ${repairable
    .map(
      (table) => `SELECT 1 FROM "${table}"
                       WHERE is_sample_data = true AND sample_data_owner_id IS NULL`,
    )
    .join("\n        UNION ALL\n        ")}
      ) AS orphans
  `);

  const left = remaining[0]?.n ?? 0;
  if (left > 0) {
    console.log(
      `[restore-orphaned-sample-data-owners] ${left} row(s) left unowned — their builder has ` +
        (shared.length > 0
          ? `sample data shared between several accounts (${shared.length} builder(s)), or `
          : "") +
        "no owned sample data to identify them by. They are untouched.",
    );
  }
}

/**
 * Nothing to undo. Reverting would mean putting the rows back into the broken
 * state this repairs — flagged as sample data and belonging to nobody — and
 * which of them arrived there this way is not recorded.
 */
export async function down() {
  // Intentionally empty.
}

export default { up, down };
