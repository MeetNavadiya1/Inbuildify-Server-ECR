"use strict";

/**
 * Estimation (Admin → Estimation).
 *
 * `estimate_parameter` holds the inputs a builder estimates from (area,
 * bedrooms, project type…) and `estimate_material` the lines priced from them,
 * each with a formula over the parameters. Both are per tenant: one set per
 * builder, or per company for users with no builder.
 *
 * `variable` is unique per tenant within each table here; uniqueness ACROSS the
 * two tables (they share one formula namespace) is enforced by the service,
 * since Postgres cannot index across tables.
 *
 * Indexes are created outside the table guard: the server calls `.sync()` on
 * boot, so the tables may already exist from the models (which carry the
 * columns but not these indexes). The tenant key is an expression index for the
 * same reason as quotation_terms — NULLs are distinct in a plain UNIQUE.
 */

const NIL_UUID = "'00000000-0000-0000-0000-000000000000'::uuid";

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
    `CREATE UNIQUE INDEX IF NOT EXISTS estimate_parameter_tenant_variable_uq
       ON estimate_parameter (COALESCE(builder_id, ${NIL_UUID}), COALESCE(company_id, ${NIL_UUID}), variable)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS estimate_material_tenant_variable_uq
       ON estimate_material (COALESCE(builder_id, ${NIL_UUID}), COALESCE(company_id, ${NIL_UUID}), variable)`,
    "CREATE INDEX IF NOT EXISTS estimate_parameter_tenant_idx ON estimate_parameter (builder_id, company_id)",
    "CREATE INDEX IF NOT EXISTS estimate_material_tenant_idx ON estimate_material (builder_id, company_id)",
  ];

  for (const sql of statements) {
    await queryInterface.sequelize.query(sql);
  }
}

export async function up(queryInterface, Sequelize) {
  const existing = await queryInterface.showAllTables();

  if (!existing.includes("estimate_parameter")) {
    await queryInterface.createTable("estimate_parameter", {
      estimate_parameter_id: uuidPk(Sequelize),

      company_id: { type: Sequelize.UUID, allowNull: true },
      builder_id: { type: Sequelize.UUID, allowNull: true },

      label: { type: Sequelize.STRING(120), allowNull: false },
      variable: { type: Sequelize.STRING(60), allowNull: false },
      // number | select | boolean | formula
      input_type: { type: Sequelize.STRING(20), allowNull: false, defaultValue: "number" },
      unit: { type: Sequelize.STRING(30), allowNull: true },
      // [{ label, value }] for select parameters.
      options: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      default_value: { type: Sequelize.DECIMAL(18, 4), allowNull: true },
      // Only for input_type = formula.
      formula: { type: Sequelize.TEXT, allowNull: true },
      description: { type: Sequelize.STRING(500), allowNull: true },

      sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },

      created_by: { type: Sequelize.UUID, allowNull: true },
      updated_by: { type: Sequelize.UUID, allowNull: true },

      ...timestamps(Sequelize),
    });
  }

  if (!existing.includes("estimate_material")) {
    await queryInterface.createTable("estimate_material", {
      estimate_material_id: uuidPk(Sequelize),

      company_id: { type: Sequelize.UUID, allowNull: true },
      builder_id: { type: Sequelize.UUID, allowNull: true },

      name: { type: Sequelize.STRING(120), allowNull: false },
      variable: { type: Sequelize.STRING(60), allowNull: false },
      unit: { type: Sequelize.STRING(30), allowNull: true },
      formula: { type: Sequelize.TEXT, allowNull: false },
      unit_price: { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
      description: { type: Sequelize.STRING(500), allowNull: true },

      sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },

      created_by: { type: Sequelize.UUID, allowNull: true },
      updated_by: { type: Sequelize.UUID, allowNull: true },

      ...timestamps(Sequelize),
    });
  }

  await ensureIndexes(queryInterface);
}

export async function down(queryInterface) {
  const existing = await queryInterface.showAllTables();
  if (existing.includes("estimate_material")) {
    await queryInterface.dropTable("estimate_material");
  }
  if (existing.includes("estimate_parameter")) {
    await queryInterface.dropTable("estimate_parameter");
  }
}

export default { up, down };
