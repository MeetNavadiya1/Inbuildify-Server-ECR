"use strict";

/**
 * Third and final pass of the sample-data flag.
 *
 * 20260727180000 covered leads, 20260728120000 the quotation catalog and
 * 20260728130000 the pipeline records hanging off a sample lead. The importer
 * now also clones the settings masters (services, lead sources, workflow
 * processes, colours, suppliers, holidays, survey templates, estates, cost
 * centres, contract formats, user groups, structural engineers, package groups,
 * maintenance areas) and the standalone activity records (tasks, appointments,
 * to-dos), so each of those needs to be identifiable as seeded on its own.
 *
 * Only rows with an identity of their own are flagged. Everything that is a
 * child of one of these — workflow_process_task, color_category /
 * color_sub_category / color_item and their custom fields, supplier contacts and
 * documents, survey questions, estate stages / features / documents / images,
 * contract_section, package_pricelist_item_map, the lead activity records and
 * the whole job colour + maintenance tree — is purged by walking the foreign key
 * from its flagged parent, exactly as the existing purge does for job children.
 */
const TABLES = [
  // Settings → masters
  "service",
  "lead_source",
  "workflow_process",
  "holiday",
  "user_group",
  "cost_center",
  "structure_engineer",
  "supplier",
  "supplier_type",
  "color",
  "color_type",
  "color_group",
  "survey_template",
  "estate",
  "contract_format",
  "package_group",
  "maintenance_area",
  // Standalone activity records (they may or may not link to a lead / job)
  "task",
  "appointment",
  "todo",
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
