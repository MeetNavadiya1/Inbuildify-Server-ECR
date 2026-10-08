"use strict";

/**
 * Completes the sample-data flag across every table the onboarding importer
 * writes a record into.
 *
 * 20260727180000 covered leads; 20260728120000 covered the catalog. This adds
 * the remaining seeded entities — the pipeline records that hang off a sample
 * lead, the demo contacts, and the DriveFile rows for seeded images — so a
 * seeded row can be identified on its own rather than only by walking a foreign
 * key back to its lead.
 *
 * Pure link tables are intentionally excluded: floor_plan_facade_map,
 * floor_plan_pricelist_item_map, leads_contact_map, job_task_dependency,
 * quotation_version_pricelist_item_map and quotation_version_package_map hold no
 * identity of their own and always cascade with the row they link.
 */
const TABLES = [
  // Lead-side records
  "property_detail",
  "address",
  "users",
  "opportunity",
  // Quotation-side records
  "quotation",
  "quotation_version",
  "quotation_version_items",
  "quotation_version_custom_section",
  // Job-side records
  "job",
  "job_sub_stage",
  "job_task",
  "job_subtask",
  "job_invoice",
  "job_invoice_payment",
  // Catalog children + seeded files
  "price_list_item_condition",
  "drive_files",
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
