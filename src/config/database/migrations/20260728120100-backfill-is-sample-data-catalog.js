"use strict";

/**
 * Catalog rows seeded BEFORE `is_sample_data` existed carry the default `false`,
 * so Settings → Sample Data would refuse to delete them. This backfills the flag
 * for those rows.
 *
 * Identification: the importer clones the master dummy builder's catalog, so a
 * row is treated as seeded when it belongs to a builder that actually received
 * the seeder (it has at least one `leads.is_sample_data` row) AND its name
 * matches a row in the dummy builder's catalog.
 *
 * Caveat, deliberately accepted: the importer reuses an existing same-named row
 * instead of creating a duplicate, so a row the builder had created themselves
 * before onboarding and that the importer then reused gets flagged here too. In
 * practice onboarding runs moments after signup, when the only pre-existing rows
 * are the builder defaults. If a flagged row is later pinned by real data, the
 * purge skips it and reports it rather than deleting it.
 *
 * No-op when the master dummy account does not exist (nothing was ever seeded).
 */
const TABLES = [
  { table: "location", nameColumn: "name" },
  { table: "range", nameColumn: "name" },
  { table: "dwelling_type", nameColumn: "name" },
  { table: "package", nameColumn: "name" },
  { table: "price_list", nameColumn: "name" },
  { table: "price_list_item", nameColumn: "item_description" },
  { table: "facade", nameColumn: "name" },
  { table: "floor_plan", nameColumn: "name" },
];

/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface) {
  const dummyEmail = process.env.DUMMY_DATA_EMAIL || "dummy@inbuildify.com";

  const [dummyUsers] = await queryInterface.sequelize.query(
    `SELECT builder_id FROM "users" WHERE LOWER(email) = LOWER(:dummyEmail) LIMIT 1`,
    { replacements: { dummyEmail } },
  );

  const dummyBuilderId = dummyUsers?.[0]?.builder_id;
  if (!dummyBuilderId) return;

  for (const { table, nameColumn } of TABLES) {
    await queryInterface.sequelize.query(
      `
      UPDATE "${table}" AS target
      SET "is_sample_data" = true
      WHERE target."is_sample_data" = false
        AND target."builder_id" IS NOT NULL
        AND target."builder_id" <> :dummyBuilderId
        AND target."builder_id" IN (
          SELECT DISTINCT "builder_id" FROM "leads" WHERE "is_sample_data" = true
        )
        AND EXISTS (
          SELECT 1 FROM "${table}" AS seed
          WHERE seed."builder_id" = :dummyBuilderId
            AND seed."${nameColumn}" = target."${nameColumn}"
        );
      `,
      { replacements: { dummyBuilderId } },
    );
  }
}

export async function down() {
  // Not reversible: once flagged there is no record of which rows were false
  // beforehand. Dropping the column (20260728120000 down) clears it entirely.
}
