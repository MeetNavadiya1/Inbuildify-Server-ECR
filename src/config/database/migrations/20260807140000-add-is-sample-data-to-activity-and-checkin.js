"use strict";

/**
 * Fourth pass of the sample-data flag: the global Activity timeline and Site
 * Check-In.
 *
 * Both modules were left out of the importer, so a freshly onboarded company
 * opened Activity onto an empty page and Site Check-In onto the bare default
 * field template — neither looked like the rest of the demo dataset, which is
 * populated. The importer now clones them, and each of these tables needs to be
 * able to answer "am I seeded?" on its own so Settings → Sample Data can badge
 * and clear them.
 *
 * `site_checkin_record.responses` is keyed by `site_checkin_field_id`, so the
 * fields carry the flag as well as the records — the clone rewrites those keys
 * onto the target's own fields and both halves have to be purgeable together.
 */
const TABLES = ["activity_logs", "site_checkin_field", "site_checkin_record"];

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
