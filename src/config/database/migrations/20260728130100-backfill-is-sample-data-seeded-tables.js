"use strict";

/**
 * Backfills `is_sample_data` on records seeded before the flag reached these
 * tables.
 *
 * Unlike the catalog backfill (20260728120100) nothing is guessed by name here:
 * every statement walks a foreign key from a row that is already flagged, so a
 * record is marked only when it provably hangs off seeded data.
 *
 * Starting points: `leads.is_sample_data` (set since 20260727180000) and the
 * catalog flags set by 20260728120000 + 20260728120100.
 */
const STATEMENTS = [
  // ── Lead-side ──────────────────────────────────────────────────────────────
  `UPDATE "property_detail" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "property_detail_id" IN (
         SELECT "property_detail_id" FROM "leads"
         WHERE "is_sample_data" = true AND "property_detail_id" IS NOT NULL
       )`,

  // Demo contacts reached through the lead↔contact link table.
  `UPDATE "users" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "users_id" IN (
         SELECT m."contact_id" FROM "leads_contact_map" m
         JOIN "leads" l ON l."leads_id" = m."leads_id"
         WHERE l."is_sample_data" = true AND m."contact_id" IS NOT NULL
       )`,

  // Addresses belonging to those contacts (run after the users update above).
  `UPDATE "address" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "address_id" IN (
         SELECT "address_id" FROM "users"
         WHERE "is_sample_data" = true AND "address_id" IS NOT NULL
       )`,

  `UPDATE "opportunity" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "leads_id" IN (SELECT "leads_id" FROM "leads" WHERE "is_sample_data" = true)`,

  // ── Quotation-side ─────────────────────────────────────────────────────────
  `UPDATE "quotation" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "leads_id" IN (SELECT "leads_id" FROM "leads" WHERE "is_sample_data" = true)`,

  `UPDATE "quotation_version" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "quotation_id" IN (SELECT "quotation_id" FROM "quotation" WHERE "is_sample_data" = true)`,

  `UPDATE "quotation_version_items" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "quotation_version_id" IN (
         SELECT "quotation_version_id" FROM "quotation_version" WHERE "is_sample_data" = true
       )`,

  `UPDATE "quotation_version_custom_section" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "quotation_version_id" IN (
         SELECT "quotation_version_id" FROM "quotation_version" WHERE "is_sample_data" = true
       )`,

  // ── Job-side ───────────────────────────────────────────────────────────────
  `UPDATE "job" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "opportunity_id" IN (
         SELECT "opportunity_id" FROM "opportunity" WHERE "is_sample_data" = true
       )`,

  `UPDATE "job_sub_stage" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "job_id" IN (SELECT "job_id" FROM "job" WHERE "is_sample_data" = true)`,

  `UPDATE "job_task" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "job_id" IN (SELECT "job_id" FROM "job" WHERE "is_sample_data" = true)`,

  `UPDATE "job_subtask" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "job_id" IN (SELECT "job_id" FROM "job" WHERE "is_sample_data" = true)`,

  `UPDATE "job_invoice" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "job_id" IN (SELECT "job_id" FROM "job" WHERE "is_sample_data" = true)`,

  `UPDATE "job_invoice_payment" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "job_invoice_id" IN (
         SELECT "job_invoice_id" FROM "job_invoice" WHERE "is_sample_data" = true
       )`,

  // ── Catalog children + seeded images ───────────────────────────────────────
  `UPDATE "price_list_item_condition" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "price_list_item_id" IN (
         SELECT "price_list_item_id" FROM "price_list_item" WHERE "is_sample_data" = true
       )`,

  `UPDATE "drive_files" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND (
         "file_id" IN (SELECT "detailed_image" FROM "floor_plan" WHERE "is_sample_data" = true AND "detailed_image" IS NOT NULL)
         OR "file_id" IN (SELECT "simple_image" FROM "floor_plan" WHERE "is_sample_data" = true AND "simple_image" IS NOT NULL)
         OR "file_id" IN (SELECT "image" FROM "facade" WHERE "is_sample_data" = true AND "image" IS NOT NULL)
         OR "file_id" IN (SELECT "compaction_report_url" FROM "property_detail" WHERE "is_sample_data" = true AND "compaction_report_url" IS NOT NULL)
       )`,
];

/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface) {
  // Order matters: each statement reads flags set by the ones before it.
  for (const sql of STATEMENTS) {
    await queryInterface.sequelize.query(sql);
  }
}

export async function down() {
  // Not reversible: there is no record of which rows were false beforehand.
  // Dropping the columns (20260728130000 down) clears the flag entirely.
}
