"use strict";

/**
 * Flag the seeded rows the earlier backfills never reached.
 *
 * `is_sample_data` arrived table by table. Three of the column-adds shipped
 * without a matching backfill — 20260806120000 (extended tables, `lead_source`
 * among them), 20260806160000 (drive) and 20260806180000 (formats, survey
 * responses, variations) — so on any company onboarded before those ran, the
 * seeded rows in those tables still read `false`.
 *
 * The visible symptom: the demo lead sources show up in the Lead Source picker
 * on a new lead and cannot be told apart from ones the builder added, because
 * as far as the column is concerned they are not sample data at all. Settings →
 * Sample Data will not clear them either, for the same reason.
 *
 * Identification follows 20260728120100, the backfill that already proved the
 * approach: a row is seeded when it belongs to a builder that actually received
 * the importer (it holds at least one `leads.is_sample_data` row) and its
 * natural key matches a row on the master dummy builder. The natural keys below
 * are the `matchOn` specs the importer itself de-duplicates against, so this
 * flags exactly the rows a re-import would recognise as already present.
 *
 * Caveat, inherited from that migration and deliberately accepted: the importer
 * reuses a same-named row rather than duplicating it, so a row the builder
 * happened to create themselves before onboarding gets flagged too. Onboarding
 * runs moments after signup, so in practice the only rows that pre-exist are
 * the builder defaults. A flagged row that real data later depends on is
 * skipped and reported by the purge, not deleted.
 *
 * No-op when the master dummy account does not exist — nothing was ever seeded.
 */

/** Masters, keyed the way the importer de-duplicates them. */
const MASTERS = [
  { table: "service", match: ["service"] },
  { table: "lead_source", match: ["name"] },
  { table: "workflow_process", match: ["name"] },
  { table: "holiday", match: ["holiday_description"] },
  { table: "user_group", match: ["name"] },
  { table: "cost_center", match: ["code"] },
  { table: "structure_engineer", match: ["name"] },
  { table: "supplier_type", match: ["name"] },
  { table: "supplier", match: ["company_name"] },
  { table: "color_type", match: ["color_type_name"] },
  { table: "color_group", match: ["name"] },
  { table: "color", match: ["color_name"] },
  { table: "survey_template", match: ["name"] },
  { table: "estate", match: ["name"] },
  { table: "contract_format", match: ["format_name"] },
  { table: "package_group", match: ["name"] },
  { table: "maintenance_area", match: ["name"] },
  { table: "quotation_format", match: ["format_name"] },
  { table: "job_variation_approval", match: ["amount"] },
  // Seeded folders are cloned by name under the target builder.
  { table: "drive", match: ["name"] },
];

/**
 * Children, flagged by walking up to an already-flagged parent.
 *
 * Order is shallowest-first so each parent is flagged before the rows that
 * point at it are checked. `job` and `survey_template` are flagged by an
 * earlier migration and by MASTERS above respectively.
 */
const CHILDREN = [
  { table: "master_section", fk: "quotation_format_id", parent: "quotation_format", parentPk: "quotation_format_id" },
  { table: "quotation_format_custom_section", fk: "quotation_format_id", parent: "quotation_format", parentPk: "quotation_format_id" },
  { table: "master_section_header", fk: "master_section_id", parent: "master_section", parentPk: "master_section_id" },
  { table: "master_section_item", fk: "master_section_header_id", parent: "master_section_header", parentPk: "master_section_header_id" },
  { table: "survey_response", fk: "survey_template_id", parent: "survey_template", parentPk: "survey_template_id" },
  { table: "survey_response_answer", fk: "survey_response_id", parent: "survey_response", parentPk: "survey_response_id" },
  { table: "job_variation", fk: "job_id", parent: "job", parentPk: "job_id" },
  { table: "job_variation_item", fk: "variation_id", parent: "job_variation", parentPk: "variation_id" },
  { table: "todo", fk: "job_id", parent: "job", parentPk: "job_id" },
];

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
  const dummyEmail = process.env.DUMMY_DATA_EMAIL || "dummy@inbuildify.com";

  const [dummyUsers] = await queryInterface.sequelize.query(
    `SELECT builder_id FROM "users" WHERE LOWER(email) = LOWER(:dummyEmail) LIMIT 1`,
    { replacements: { dummyEmail } },
  );

  const dummyBuilderId = dummyUsers?.[0]?.builder_id;
  if (!dummyBuilderId) {
    console.log(`[backfill-sample-data] No account for ${dummyEmail} — nothing was ever seeded.`);
    return;
  }

  for (const { table, match } of MASTERS) {
    if (!(await usable(queryInterface, table, ["is_sample_data", "builder_id", ...match]))) {
      console.log(`[backfill-sample-data] Skipping ${table} — table or column not present.`);
      continue;
    }

    // IS NOT DISTINCT FROM so a NULL on both sides still counts as a match;
    // plain `=` would silently skip those rows.
    const on = match
      .map((column) => `seed."${column}" IS NOT DISTINCT FROM target."${column}"`)
      .join(" AND ");

    const [, result] = await queryInterface.sequelize.query(
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
            AND ${on}
        );
      `,
      { replacements: { dummyBuilderId } },
    );

    console.log(`[backfill-sample-data] ${table}: flagged ${result?.rowCount ?? 0}`);
  }

  for (const { table, fk, parent, parentPk } of CHILDREN) {
    if (!(await usable(queryInterface, table, ["is_sample_data", fk]))) {
      console.log(`[backfill-sample-data] Skipping ${table} — table or column not present.`);
      continue;
    }
    if (!(await usable(queryInterface, parent, ["is_sample_data", parentPk]))) {
      console.log(`[backfill-sample-data] Skipping ${table} — parent ${parent} not usable.`);
      continue;
    }

    const [, result] = await queryInterface.sequelize.query(`
      UPDATE "${table}"
      SET "is_sample_data" = true
      WHERE "is_sample_data" = false
        AND "${fk}" IN (
          SELECT "${parentPk}" FROM "${parent}" WHERE "is_sample_data" = true
        );
    `);

    console.log(`[backfill-sample-data] ${table}: flagged ${result?.rowCount ?? 0}`);
  }
}

export async function down() {
  // Not reversible: once flagged there is no record of which rows read false
  // beforehand. Dropping the columns clears the flag entirely.
}
