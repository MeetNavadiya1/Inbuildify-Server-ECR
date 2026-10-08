"use strict";

/**
 * Completes the sample-data flag across EVERY table the importer writes a row
 * into, children and link tables included.
 *
 * The earlier passes (20260727180000 / 20260728120000 / 20260728130000 /
 * 20260806120000) flagged only rows with an identity of their own, on the
 * reasoning that a child is identifiable by walking the foreign key back to its
 * flagged parent. That holds for the purge, but it leaves a cloned row unable to
 * answer "am I sample data?" on its own — which is what the Sample badge and any
 * per-row filtering need. Every copy the importer makes now carries the flag.
 *
 * The purge still deletes children by walking their parent; the flag is what
 * makes a seeded row self-describing, and lets an orphan be swept if its parent
 * chain was broken by hand.
 */
const TABLES = [
  // Settings master children
  "workflow_process_task",
  "supplier_contacts",
  "supplier_documents",
  "supplier_supplier_type_map",
  "color_category",
  "color_sub_category",
  "color_item",
  "color_item_custom_field",
  "color_group_item_map",
  "survey_template_questions",
  "estate_stages",
  "estate_features",
  "estate_documents",
  "estate_images",
  "contract_section",
  "cost_center_checklist_map",
  "package_pricelist_item_map",
  // Lead-side records
  "business_contact",
  "actions",
  "notes",
  "sms",
  "lead_activity_log",
  // Job colour tree
  "job_color",
  "job_color_category",
  "job_color_sub_category",
  "job_color_item",
  "job_color_item_custom_field",
  "job_color_group_item_map",
  "job_color_selection",
  // Maintenance
  "maintenance",
  "maintenance_request",
  "maintenance_request_task",
  // Link tables the importer already cloned but never tagged
  "floor_plan_facade_map",
  "floor_plan_pricelist_item_map",
  "leads_contact_map",
  "job_task_dependency",
  "quotation_version_pricelist_item_map",
  "quotation_version_package_map",
];

/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface, Sequelize) {
  for (const table of TABLES) {
    const described = await queryInterface.describeTable(table);
    if (described.is_sample_data) continue;

    await queryInterface.addColumn(table, "is_sample_data", {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    });
  }
}

export async function down(queryInterface) {
  for (const table of TABLES) {
    const described = await queryInterface.describeTable(table);
    if (!described.is_sample_data) continue;

    await queryInterface.removeColumn(table, "is_sample_data");
  }
}
