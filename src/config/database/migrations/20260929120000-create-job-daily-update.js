"use strict";

/**
 * Builder daily site updates (Job → Daily Updates).
 *
 * One row per update a builder-side user posts against a job: the day it
 * covers, what was done, and free-form notes on progress. Several rows may share
 * a date (two crews, a morning and an afternoon note), so there is no unique
 * (job_id, update_date) constraint — the day/week views group them instead.
 *
 * Photos are not columns here. They live in drive_files under
 * reference_type = JobDailyUpdateImage, reference_id = job_daily_update_id,
 * like maintenance site images, so an update can carry any number of them.
 *
 * The homebuyer reads these through job.customer_contact_id, so the table only
 * needs job_id to be reachable from the Contact dashboard.
 */

const uuidPk = (Sequelize) => ({
  type: Sequelize.UUID,
  defaultValue: Sequelize.literal("gen_random_uuid()"),
  primaryKey: true,
  allowNull: false,
});

async function ensureIndexes(queryInterface) {
  const statements = [
    // Every read is "this job, this date range, newest first".
    `CREATE INDEX IF NOT EXISTS job_daily_update_job_date_idx
       ON job_daily_update (job_id, update_date DESC)`,
  ];

  for (const sql of statements) {
    await queryInterface.sequelize.query(sql);
  }
}

export async function up(queryInterface, Sequelize) {
  const existing = await queryInterface.showAllTables();

  if (!existing.includes("job_daily_update")) {
    await queryInterface.createTable("job_daily_update", {
      job_daily_update_id: uuidPk(Sequelize),

      job_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "job", key: "job_id" },
        onDelete: "CASCADE",
      },
      company_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "company", key: "company_id" },
        onDelete: "SET NULL",
      },
      builder_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "builder", key: "builder_id" },
        onDelete: "SET NULL",
      },

      update_date: { type: Sequelize.DATEONLY, allowNull: false },
      work_completed: { type: Sequelize.TEXT, allowNull: false },
      notes: { type: Sequelize.TEXT, allowNull: true },

      created_by: { type: Sequelize.UUID, allowNull: true },
      updated_by: { type: Sequelize.UUID, allowNull: true },

      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
    });
  }

  await ensureIndexes(queryInterface);
}

export async function down(queryInterface) {
  const existing = await queryInterface.showAllTables();
  if (existing.includes("job_daily_update")) {
    await queryInterface.dropTable("job_daily_update");
  }
}

export default { up, down };
