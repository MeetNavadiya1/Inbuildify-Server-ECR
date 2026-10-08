"use strict";

/**
 * Job-wise estimates (Job → Estimate & Dashboard).
 *
 * The parameters and materials themselves stay per tenant in
 * `estimate_parameter` / `estimate_material` — one set of formulas and rates
 * for the builder. What differs from job to job is only what the estimator
 * types in: area, bedrooms, ceiling height. Those land here, one row per
 * (job, parameter), so two jobs priced from the same set never see each
 * other's numbers.
 *
 * A parameter with no row for a job falls back to that parameter's own default,
 * which is what a job opened for the first time is estimated from. Rows are
 * keyed by `estimate_parameter_id` rather than by `variable`, so renaming a
 * variable in the settings does not orphan every job's saved value.
 */

const uuidPk = (Sequelize) => ({
  type: Sequelize.UUID,
  defaultValue: Sequelize.literal("gen_random_uuid()"),
  primaryKey: true,
  allowNull: false,
});

async function ensureIndexes(queryInterface) {
  const statements = [
    `CREATE UNIQUE INDEX IF NOT EXISTS estimate_job_value_job_parameter_uq
       ON estimate_job_value (job_id, estimate_parameter_id)`,
    "CREATE INDEX IF NOT EXISTS estimate_job_value_job_idx ON estimate_job_value (job_id)",
  ];

  for (const sql of statements) {
    await queryInterface.sequelize.query(sql);
  }
}

export async function up(queryInterface, Sequelize) {
  const existing = await queryInterface.showAllTables();

  if (!existing.includes("estimate_job_value")) {
    await queryInterface.createTable("estimate_job_value", {
      estimate_job_value_id: uuidPk(Sequelize),

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

      job_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "job", key: "job_id" },
        onDelete: "CASCADE",
      },
      estimate_parameter_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "estimate_parameter", key: "estimate_parameter_id" },
        onDelete: "CASCADE",
      },

      // Yes/No parameters are stored as 1/0 and dropdowns as the chosen
      // option's numeric value — the same shape the formula engine sees.
      value: { type: Sequelize.DECIMAL(18, 4), allowNull: false },

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
  if (existing.includes("estimate_job_value")) {
    await queryInterface.dropTable("estimate_job_value");
  }
}

export default { up, down };
