"use strict";

/**
 * `job_activity_log` was the one activity table the sample-data feature never
 * reached: `lead_activity_log` and `activity_log` are both cloned and flagged,
 * this one is neither. The visible effect is the Activity tab on a seeded job
 * rendering empty.
 *
 * The column has to exist before the importer can flag what it clones, and
 * before the purge can find those rows again to clear them.
 *
 * No backfill: nothing was ever cloned into this table, so there are no seeded
 * rows to mark. Existing companies pick up their job activity on the next
 * Settings → Sample Data restore.
 */

/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface, Sequelize) {
  const described = await queryInterface.describeTable("job_activity_log");
  if (described.is_sample_data) return;

  await queryInterface.addColumn("job_activity_log", "is_sample_data", {
    type: Sequelize.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  });
}

export async function down(queryInterface) {
  const described = await queryInterface.describeTable("job_activity_log");
  if (!described.is_sample_data) return;

  await queryInterface.removeColumn("job_activity_log", "is_sample_data");
}
