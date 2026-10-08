"use strict";

/**
 * "Apply changes to existing jobs?" — the No half.
 *
 * Estimation settings are one shared set per tenant, and a job is priced from
 * them live. That is what makes a rate change reach every job ever quoted, which
 * is right when the admin meant it and wrong when they did not.
 *
 * When they answer No, the row they are about to change is FROZEN: its current
 * state is written to `estimate_frozen_row` once, and `estimate_job_frozen_row`
 * pins that state to every job that existed at the time. Those jobs keep seeing
 * the old row; the live row moves on, and any job created afterwards gets it.
 *
 * Only the declined row is frozen, not the whole configuration — so a later
 * "Yes" on a different material still reaches those jobs, which is the part a
 * whole-config snapshot gets wrong.
 *
 * `snapshot` NULL means "this row did not exist for you", which is how a newly
 * added material is kept off existing jobs. `row_id` deliberately carries NO
 * foreign key: a frozen row outlives the live row it came from, and deleting a
 * material must not erase the copy the older jobs are still priced from.
 */

const uuidPk = (Sequelize) => ({
  type: Sequelize.UUID,
  defaultValue: Sequelize.literal("gen_random_uuid()"),
  primaryKey: true,
  allowNull: false,
});

const timestamps = (Sequelize) => ({
  created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
  updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
});

async function ensureIndexes(queryInterface) {
  const statements = [
    // The read path: every frozen row pinned to one job.
    "CREATE INDEX IF NOT EXISTS estimate_job_frozen_row_job_idx ON estimate_job_frozen_row (job_id)",
    "CREATE INDEX IF NOT EXISTS estimate_job_frozen_row_frozen_idx ON estimate_job_frozen_row (frozen_row_id)",
    // The write path: find/release every freeze of one configuration row.
    `CREATE INDEX IF NOT EXISTS estimate_frozen_row_target_idx
       ON estimate_frozen_row (builder_id, company_id, kind, row_id)`,
  ];

  for (const sql of statements) {
    await queryInterface.sequelize.query(sql);
  }
}

export async function up(queryInterface, Sequelize) {
  const existing = await queryInterface.showAllTables();

  if (!existing.includes("estimate_frozen_row")) {
    await queryInterface.createTable("estimate_frozen_row", {
      frozen_row_id: uuidPk(Sequelize),

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

      // "parameter" | "material"
      kind: { type: Sequelize.STRING(20), allowNull: false },
      // estimate_parameter_id / estimate_material_id. No FK — see the note above.
      row_id: { type: Sequelize.UUID, allowNull: false },
      // The row as it stood, or NULL for "it did not exist for you".
      snapshot: { type: Sequelize.JSONB, allowNull: true },
      // Why it was frozen, for the audit trail: "price", "formula", "deleted"…
      reason: { type: Sequelize.STRING(120), allowNull: true },

      created_by: { type: Sequelize.UUID, allowNull: true },

      ...timestamps(Sequelize),
    });
  }

  if (!existing.includes("estimate_job_frozen_row")) {
    await queryInterface.createTable("estimate_job_frozen_row", {
      job_id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        references: { model: "job", key: "job_id" },
        onDelete: "CASCADE",
      },
      frozen_row_id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        references: { model: "estimate_frozen_row", key: "frozen_row_id" },
        onDelete: "CASCADE",
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
    });
  }

  await ensureIndexes(queryInterface);
}

export async function down(queryInterface) {
  const existing = await queryInterface.showAllTables();
  if (existing.includes("estimate_job_frozen_row")) {
    await queryInterface.dropTable("estimate_job_frozen_row");
  }
  if (existing.includes("estimate_frozen_row")) {
    await queryInterface.dropTable("estimate_frozen_row");
  }
}

export default { up, down };
