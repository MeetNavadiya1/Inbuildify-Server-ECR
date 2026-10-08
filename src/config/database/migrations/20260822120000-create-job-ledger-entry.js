"use strict";

/**
 * `job_ledger_entry` — the manual side of a job's account.
 *
 * Until now a job's money was entirely derived: the quotation grand total, the
 * colour selections, the approved variations and the invoice payments. There
 * was nowhere for a builder to record an out-of-contract charge, a discount, or
 * their own outside/personal spend on the job — so "Balance to be paid" could
 * only ever be the contract arithmetic, and profit was invisible.
 *
 * One table, two books (`ledger`):
 *  - customer → moves Balance to be paid
 *  - expense  → moves Profit / Loss only
 * `entry_type` (debit/credit) gives the direction inside whichever book.
 *
 * Deliberately NOT stored here: invoice payments. They stay in
 * `job_invoice_payment` and are projected into the ledger read-only, so there
 * is exactly one row per payment and no chance of double-counting.
 *
 * Indexes are created outside the table guard: the server calls `.sync()` on
 * boot, so the table may already exist from the model (which carries the
 * columns but not these indexes).
 */

const TABLE = "job_ledger_entry";

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
    `CREATE INDEX IF NOT EXISTS job_ledger_entry_job_idx ON ${TABLE} (job_id)`,
    `CREATE INDEX IF NOT EXISTS job_ledger_entry_tenant_idx ON ${TABLE} (builder_id, company_id)`,
    `CREATE INDEX IF NOT EXISTS job_ledger_entry_book_idx ON ${TABLE} (job_id, ledger, entry_date)`,
  ];

  for (const sql of statements) {
    await queryInterface.sequelize.query(sql);
  }
}

export async function up(queryInterface, Sequelize) {
  const existing = await queryInterface.showAllTables();

  if (!existing.includes(TABLE)) {
    await queryInterface.createTable(TABLE, {
      job_ledger_entry_id: uuidPk(Sequelize),

      job_id: { type: Sequelize.UUID, allowNull: false },
      company_id: { type: Sequelize.UUID, allowNull: true },
      builder_id: { type: Sequelize.UUID, allowNull: true },

      ledger: { type: Sequelize.STRING(20), allowNull: false, defaultValue: "customer" },
      entry_type: { type: Sequelize.STRING(10), allowNull: false },
      category: { type: Sequelize.STRING(50), allowNull: true },

      description: { type: Sequelize.STRING(255), allowNull: false },
      amount: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      entry_date: { type: Sequelize.DATEONLY, allowNull: false },

      payment_method: { type: Sequelize.STRING(50), allowNull: true },
      reference_number: { type: Sequelize.STRING(50), allowNull: true },
      is_personal: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      notes: { type: Sequelize.STRING(500), allowNull: true },

      created_by: { type: Sequelize.UUID, allowNull: true },
      updated_by: { type: Sequelize.UUID, allowNull: true },
      is_sample_data: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },

      ...timestamps(Sequelize),
    });
  }

  await ensureIndexes(queryInterface);
}

export async function down(queryInterface) {
  const existing = await queryInterface.showAllTables();
  if (existing.includes(TABLE)) await queryInterface.dropTable(TABLE);
}

export default { up, down };
