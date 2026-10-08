"use strict";

/**
 * Backfills the flag added by 20260806140000 onto sample data that is already
 * imported, so it does not have to be deleted and re-imported to be recognised.
 *
 * Nothing is guessed: every statement walks a foreign key from a row that is
 * already flagged, so a record is marked only when it provably hangs off seeded
 * data. Order matters — the colour, maintenance and quotation chains each read
 * flags set by the statement before them.
 */
const STATEMENTS = [
  // ── Settings master children ───────────────────────────────────────────────
  `UPDATE "workflow_process_task" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "workflow_process_id" IN (
         SELECT "workflow_process_id" FROM "workflow_process" WHERE "is_sample_data" = true
       )`,

  `UPDATE "supplier_contacts" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "supplier_id" IN (SELECT "supplier_id" FROM "supplier" WHERE "is_sample_data" = true)`,

  `UPDATE "supplier_documents" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "supplier_id" IN (SELECT "supplier_id" FROM "supplier" WHERE "is_sample_data" = true)`,

  `UPDATE "supplier_supplier_type_map" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "supplier_id" IN (SELECT "supplier_id" FROM "supplier" WHERE "is_sample_data" = true)`,

  // Colour tree, top down.
  `UPDATE "color_category" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "color_id" IN (SELECT "color_id" FROM "color" WHERE "is_sample_data" = true)`,

  `UPDATE "color_sub_category" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "color_category_id" IN (
         SELECT "color_category_id" FROM "color_category" WHERE "is_sample_data" = true
       )`,

  `UPDATE "color_item" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "color_category_id" IN (
         SELECT "color_category_id" FROM "color_category" WHERE "is_sample_data" = true
       )`,

  `UPDATE "color_item_custom_field" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "color_item" IN (SELECT "color_item_id" FROM "color_item" WHERE "is_sample_data" = true)`,

  `UPDATE "color_group_item_map" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND ("color_item_id" IN (SELECT "color_item_id" FROM "color_item" WHERE "is_sample_data" = true)
         OR "color_group_id" IN (SELECT "color_group_id" FROM "color_group" WHERE "is_sample_data" = true))`,

  `UPDATE "survey_template_questions" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "survey_template_id" IN (
         SELECT "survey_template_id" FROM "survey_template" WHERE "is_sample_data" = true
       )`,

  `UPDATE "estate_stages" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "estate_id" IN (SELECT "estate_id" FROM "estate" WHERE "is_sample_data" = true)`,

  `UPDATE "estate_features" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "estate_id" IN (SELECT "estate_id" FROM "estate" WHERE "is_sample_data" = true)`,

  `UPDATE "estate_documents" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "estate_id" IN (SELECT "estate_id" FROM "estate" WHERE "is_sample_data" = true)`,

  `UPDATE "estate_images" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "estate_id" IN (SELECT "estate_id" FROM "estate" WHERE "is_sample_data" = true)`,

  `UPDATE "contract_section" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "contract_format_id" IN (
         SELECT "contract_format_id" FROM "contract_format" WHERE "is_sample_data" = true
       )`,

  `UPDATE "cost_center_checklist_map" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "cost_center_id" IN (SELECT "cost_center_id" FROM "cost_center" WHERE "is_sample_data" = true)`,

  `UPDATE "package_pricelist_item_map" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "package_id" IN (SELECT "package_id" FROM "package" WHERE "is_sample_data" = true)`,

  // ── Lead-side ──────────────────────────────────────────────────────────────
  `UPDATE "business_contact" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "leads_id" IN (SELECT "leads_id" FROM "leads" WHERE "is_sample_data" = true)`,

  `UPDATE "actions" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "leads_id" IN (SELECT "leads_id" FROM "leads" WHERE "is_sample_data" = true)`,

  `UPDATE "notes" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "leads_id" IN (SELECT "leads_id" FROM "leads" WHERE "is_sample_data" = true)`,

  `UPDATE "sms" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "leads_id" IN (SELECT "leads_id" FROM "leads" WHERE "is_sample_data" = true)`,

  `UPDATE "lead_activity_log" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "leads_id" IN (SELECT "leads_id" FROM "leads" WHERE "is_sample_data" = true)`,

  `UPDATE "leads_contact_map" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "leads_id" IN (SELECT "leads_id" FROM "leads" WHERE "is_sample_data" = true)`,

  // ── Job colour tree — every table carries job_id directly ──────────────────
  `UPDATE "job_color" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "job_id" IN (SELECT "job_id" FROM "job" WHERE "is_sample_data" = true)`,

  `UPDATE "job_color_category" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "job_id" IN (SELECT "job_id" FROM "job" WHERE "is_sample_data" = true)`,

  `UPDATE "job_color_sub_category" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "job_id" IN (SELECT "job_id" FROM "job" WHERE "is_sample_data" = true)`,

  `UPDATE "job_color_item" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "job_id" IN (SELECT "job_id" FROM "job" WHERE "is_sample_data" = true)`,

  `UPDATE "job_color_item_custom_field" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "job_id" IN (SELECT "job_id" FROM "job" WHERE "is_sample_data" = true)`,

  `UPDATE "job_color_group_item_map" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "job_id" IN (SELECT "job_id" FROM "job" WHERE "is_sample_data" = true)`,

  `UPDATE "job_color_selection" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "job_id" IN (SELECT "job_id" FROM "job" WHERE "is_sample_data" = true)`,

  // ── Maintenance chain ──────────────────────────────────────────────────────
  `UPDATE "maintenance" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "job_id" IN (SELECT "job_id" FROM "job" WHERE "is_sample_data" = true)`,

  `UPDATE "maintenance_request" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "maintenance_id" IN (
         SELECT "maintenance_id" FROM "maintenance" WHERE "is_sample_data" = true
       )`,

  `UPDATE "maintenance_request_task" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "maintenance_request_id" IN (
         SELECT "maintenance_request_id" FROM "maintenance_request" WHERE "is_sample_data" = true
       )`,

  // ── Remaining link tables ──────────────────────────────────────────────────
  `UPDATE "floor_plan_facade_map" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "floor_plan_id" IN (SELECT "floor_plan_id" FROM "floor_plan" WHERE "is_sample_data" = true)`,

  `UPDATE "floor_plan_pricelist_item_map" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "floor_plan_id" IN (SELECT "floor_plan_id" FROM "floor_plan" WHERE "is_sample_data" = true)`,

  `UPDATE "job_task_dependency" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "task_id" IN (
         SELECT "job_process_task_id" FROM "job_task" WHERE "is_sample_data" = true
       )`,

  `UPDATE "quotation_version_pricelist_item_map" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "quotation_version_id" IN (
         SELECT "quotation_version_id" FROM "quotation_version" WHERE "is_sample_data" = true
       )`,

  `UPDATE "quotation_version_package_map" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "quotation_version_id" IN (
         SELECT "quotation_version_id" FROM "quotation_version" WHERE "is_sample_data" = true
       )`,
];

/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface) {
  for (const sql of STATEMENTS) {
    await queryInterface.sequelize.query(sql);
  }
}

export async function down() {
  // Not reversible: there is no record of which rows were false beforehand.
  // Dropping the columns (20260806140000 down) clears the flag entirely.
}
