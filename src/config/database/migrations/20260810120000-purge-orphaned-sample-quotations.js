"use strict";

/**
 * Clear the seeded pipeline that earlier runs of the purge left stranded.
 *
 * Settings → Sample Data deleted the seeded leads and assumed the rest of the
 * pipeline went with them. It did not: `opportunity.leads_id` and
 * `quotation.leads_id` are ON DELETE SET NULL, so every delete unhooked the
 * opportunity, its quotation, that quotation's versions and every version item
 * instead of removing them. The service has been fixed to take the tree out
 * explicitly while the lead still names it — this clears what the old code
 * already left behind.
 *
 * Those rows cannot be reached by anything else. They carry no company_id or
 * builder_id, so no tenant-scoped sweep can find them; the summary counts
 * quotations by walking `leads_id`, which is now null, so they are not on the
 * Sample Data screen either; and nothing links them to a lead, a job or a
 * customer any more, so no application screen lists them. Left alone they sit
 * in the tenant forever and every restore lays a fresh set on top.
 *
 * Safe by construction. Both conditions have to hold:
 *
 *   - `is_sample_data = true` — only the importer ever sets this, so a builder's
 *     own quotation is out of scope no matter what state it is in;
 *   - the parent reference is NULL — the row is already detached from every
 *     screen, so this removes nothing anyone can still see.
 *
 * A live seeded quotation, one still attached to a lead, is deliberately left
 * alone: that is sample data the account can still see and clear for itself
 * from Settings → Sample Data. This migration is only for the unreachable
 * remains.
 */

/** Tables and columns arrived over several migrations; tolerate any missing. */
async function usable(queryInterface, table, columns) {
  let described;
  try {
    described = await queryInterface.describeTable(table);
  } catch {
    return false;
  }
  return columns.every((column) => Boolean(described[column]));
}

/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface) {
  const TAG = "[purge-orphan-sample-quotations]";

  const ready =
    (await usable(queryInterface, "quotation", ["is_sample_data", "leads_id"])) &&
    (await usable(queryInterface, "quotation_version", ["is_sample_data", "quotation_id"])) &&
    (await usable(queryInterface, "opportunity", ["is_sample_data", "leads_id"]));

  if (!ready) {
    console.log(`${TAG} Skipping — the sample-data columns are not present yet.`);
    return;
  }

  const run = async (label, sql) => {
    const [, result] = await queryInterface.sequelize.query(sql);
    console.log(`${TAG} ${label}: removed ${result?.rowCount ?? 0}`);
  };

  // Versions before their quotation: `quotation_version.quotation_id` is SET
  // NULL too, so deleting the quotation first would strand these the same way
  // the original bug stranded them. Everything under a version — items, custom
  // sections, the package and price-list maps — is ON DELETE CASCADE.
  await run(
    "quotation_version (under orphaned quotations)",
    `
    DELETE FROM "quotation_version"
     WHERE "is_sample_data" = true
       AND "quotation_id" IN (
         SELECT "quotation_id" FROM "quotation"
          WHERE "is_sample_data" = true AND "leads_id" IS NULL
       );
    `,
  );

  // Versions whose own quotation reference was already nulled by an earlier
  // pass, so the join above can no longer find them.
  await run(
    "quotation_version (fully detached)",
    `
    DELETE FROM "quotation_version"
     WHERE "is_sample_data" = true AND "quotation_id" IS NULL;
    `,
  );

  await run(
    "quotation",
    `
    DELETE FROM "quotation"
     WHERE "is_sample_data" = true AND "leads_id" IS NULL;
    `,
  );

  // `job.opportunity_id` is ON DELETE CASCADE, so dropping an opportunity takes
  // its job with it. Any orphan still holding a job that is not itself seeded is
  // left in place and reported: a stranded demo row is not worth deleting a real
  // job over. In practice there are none — the purge removes the seeded jobs by
  // flag before it ever reaches the leads.
  const [blocked] = await queryInterface.sequelize.query(`
    SELECT count(*)::int AS n FROM "opportunity" o
     WHERE o."is_sample_data" = true
       AND o."leads_id" IS NULL
       AND EXISTS (
         SELECT 1 FROM "job" j
          WHERE j."opportunity_id" = o."opportunity_id"
            AND j."is_sample_data" IS NOT TRUE
       );
  `);
  if (blocked?.[0]?.n > 0) {
    console.log(`${TAG} Keeping ${blocked[0].n} orphaned opportunity(ies) — real jobs hang off them.`);
  }

  await run(
    "opportunity",
    `
    DELETE FROM "opportunity" o
     WHERE o."is_sample_data" = true
       AND o."leads_id" IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM "job" j
          WHERE j."opportunity_id" = o."opportunity_id"
            AND j."is_sample_data" IS NOT TRUE
       );
    `,
  );
}

export async function down() {
  // Not reversible: the rows are gone and nothing recorded what they held. They
  // were unreachable demo records with no lead, no tenant and no screen — there
  // is nothing to restore them to. Re-importing sample data creates a fresh set.
}
