"use strict";

/**
 * Flags the last group of tables the importer clones: the quotation format and
 * its master sections, survey responses, and job variations.
 *
 * These were reported as missing from a fresh sample-data import — Settings →
 * Quotation Format came through empty, a seeded lead had no Surveys, and the
 * Variation and Survey reports had nothing to show.
 */
const TABLES = [
  "quotation_format",
  "quotation_format_custom_section",
  "master_section",
  "master_section_header",
  "master_section_item",
  "survey_response",
  "survey_response_answer",
  "job_variation",
  "job_variation_item",
  "job_variation_approval",
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
