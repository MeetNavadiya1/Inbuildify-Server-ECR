"use strict";

/**
 * Give every seeded row an owner.
 *
 * Sample data was scoped to the tenant alone — company_id + builder_id — and
 * every user the Company Administrator creates inherits both of those. So the
 * scope the purge ran on was not "this account", it was "this whole company":
 * one person clearing their demo data from Settings → Sample Data took it away
 * from every colleague at the same time.
 *
 * `sample_data_owner_id` is the missing half of that scope. The importer stamps
 * it on everything it writes (see sampleDataFlag.js), the purge and the Sample
 * Data summary filter on it, and a Company Administrator passes no owner at all
 * — which is what still lets them clear the whole company.
 *
 * Only the tables the purge sweeps by flag need it. Everything reached by
 * walking a foreign key from one of those — the colour tree under a colour, the
 * quotation sections under a format, the whole job colour and maintenance chain
 * — inherits its owner from the parent that owns it, exactly as it already
 * inherits its lifetime.
 *
 * Deliberately no foreign key onto users: the column is a scope marker, not a
 * relationship, and a hard reference would make deleting a colleague fail
 * against rows nobody is looking at.
 */

/**
 * [table, column already holding the user the import ran as].
 *
 * The importer has always stamped its audit columns with that user, so most of
 * these can be backfilled exactly rather than guessed at. `null` marks a table
 * that carries no such column — job, users and the check-in records never had
 * one, and activity_logs.user_id is the ACTOR the line describes (a cloned demo
 * teammate, usually), not the person the import belongs to.
 */
const OWNED_TABLES = [
  // ── Pipeline ───────────────────────────────────────────────────────────────
  ["leads", "created_by"],
  ["job", null],
  ["users", null],
  // ── Standalone activity records ────────────────────────────────────────────
  ["task", "created_by"],
  ["appointment", "created_by"],
  ["todo", "created_by"],
  ["activity_logs", null],
  ["site_checkin_record", null],
  ["site_checkin_field", "created_by"],
  // ── S Drive ────────────────────────────────────────────────────────────────
  ["drive", "created_by"],
  ["drive_files", "uploaded_by"],
  // ── Quotation catalog ──────────────────────────────────────────────────────
  ["price_list_item", "created_by"],
  ["price_list", "created_by"],
  ["floor_plan", "created_by"],
  ["facade", "created_by"],
  ["package", "created_by"],
  ["package_group", null],
  ["dwelling_type", "created_by"],
  ["range", "created_by"],
  ["location", "created_by"],
  // ── Settings masters ───────────────────────────────────────────────────────
  ["color", "created_by"],
  ["color_group", "created_by"],
  ["color_type", "created_by"],
  ["supplier", "created_by"],
  ["supplier_type", "created_by"],
  ["structure_engineer", "created_by"],
  ["estate", "created_by"],
  ["cost_center", "created_by"],
  ["contract_format", "created_by"],
  ["survey_template", "created_by"],
  ["quotation_format", "created_by"],
  ["job_variation_approval", "created_by"],
  ["workflow_process", null],
  ["service", null],
  ["lead_source", "created_by"],
  ["holiday", "created_by"],
  ["user_group", "created_by_id"],
  ["maintenance_area", "created_by"],
];

const COLUMN = "sample_data_owner_id";

/**
 * Who a builder's existing sample data should be attributed to, for the rows
 * whose own table cannot say.
 *
 * The seeded leads are the best answer available: they carry the importing
 * user in created_by and every company that has sample data at all has them.
 * A company whose leads were already deleted by hand falls back to its root
 * user — the Company Administrator, who is who imported it in every flow that
 * predates this column.
 *
 * A row left NULL by both is not a failure: an unowned row is simply one only a
 * Company Administrator's company-wide purge will clear.
 */
const OWNER_FALLBACK = `
  COALESCE(
    (SELECT l.created_by FROM leads l
      WHERE l.builder_id = t.builder_id
        AND l.is_sample_data = true
        AND l.created_by IS NOT NULL
      ORDER BY l.created_at ASC
      LIMIT 1),
    (SELECT u.users_id FROM users u
      WHERE u.builder_id = t.builder_id
        AND u.root_user = true
        AND u.is_deleted = false
      ORDER BY u.created_at ASC
      LIMIT 1)
  )
`;

/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface, Sequelize) {
  for (const [table, sourceColumn] of OWNED_TABLES) {
    const described = await queryInterface.describeTable(table);

    if (!described[COLUMN]) {
      await queryInterface.addColumn(table, COLUMN, {
        type: Sequelize.UUID,
        allowNull: true,
      });
    }

    // Only the table's own audit column is trusted here — and only when it
    // holds something. Everything else takes the builder-level fallback.
    const owner = sourceColumn && described[sourceColumn]
      ? `COALESCE(t.${sourceColumn}, ${OWNER_FALLBACK})`
      : OWNER_FALLBACK;

    await queryInterface.sequelize.query(`
      UPDATE "${table}" AS t
         SET ${COLUMN} = ${owner}
       WHERE t.is_sample_data = true
         AND t.${COLUMN} IS NULL
    `);
  }
}

export async function down(queryInterface) {
  for (const [table] of OWNED_TABLES) {
    const described = await queryInterface.describeTable(table);
    if (!described[COLUMN]) continue;

    await queryInterface.removeColumn(table, COLUMN);
  }
}
