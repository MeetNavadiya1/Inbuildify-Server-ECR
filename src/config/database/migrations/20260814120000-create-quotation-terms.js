"use strict";

/**
 * Builder-wise Terms & Conditions.
 *
 * `quotation_terms` holds one document per builder/company (Settings → Terms &
 * Conditions). `quotation_version_terms` records which quotation versions that
 * document has been pushed onto, together with a frozen copy of the wording at
 * push time — so a customer opening the link on an old quotation reads the
 * terms that quotation was sent with, not the builder's current draft.
 *
 * `public_token` on BOTH tables is deliberate. The per-quotation token gives
 * each PDF its own link, but a quotation that was never synced must still get a
 * working link, so the builder-level token is the fallback. Both are unique
 * across the table, so one lookup by token can serve either.
 *
 * No backfill: both tables are new, and terms only become real once a builder
 * writes and confirms them.
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

/**
 * Indexes are created OUTSIDE the "does the table exist" guard on purpose.
 *
 * The server calls `.sync()` on boot, so by the time this migration runs the
 * tables may already exist — created from the models, which carry the column
 * definitions but none of the composite/expression indexes below. Guarding the
 * indexes behind table creation silently skipped every one of them.
 *
 * The tenant uniqueness is an EXPRESSION index rather than a plain
 * UNIQUE(builder_id, company_id): Postgres treats NULLs as distinct, so a
 * tenant with a NULL company_id could otherwise accumulate duplicate terms
 * documents — the exact thing the constraint exists to prevent.
 */
const NIL_UUID = "'00000000-0000-0000-0000-000000000000'::uuid";

async function ensureIndexes(queryInterface) {
  const statements = [
    `CREATE UNIQUE INDEX IF NOT EXISTS quotation_terms_tenant_uq
       ON quotation_terms (COALESCE(builder_id, ${NIL_UUID}), COALESCE(company_id, ${NIL_UUID}))`,
    `CREATE UNIQUE INDEX IF NOT EXISTS quotation_terms_public_token_uq
       ON quotation_terms (public_token)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS quotation_version_terms_version_uq
       ON quotation_version_terms (quotation_version_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS quotation_version_terms_public_token_uq
       ON quotation_version_terms (public_token)`,
    `CREATE INDEX IF NOT EXISTS quotation_version_terms_tenant_idx
       ON quotation_version_terms (builder_id, company_id)`,
    `CREATE INDEX IF NOT EXISTS quotation_version_terms_terms_idx
       ON quotation_version_terms (quotation_terms_id)`,
  ];

  for (const sql of statements) {
    await queryInterface.sequelize.query(sql);
  }
}

export async function up(queryInterface, Sequelize) {
  const existing = await queryInterface.showAllTables();

  if (!existing.includes("quotation_terms")) {
    await queryInterface.createTable("quotation_terms", {
      quotation_terms_id: uuidPk(Sequelize),

      company_id: { type: Sequelize.UUID, allowNull: true },
      builder_id: { type: Sequelize.UUID, allowNull: true },

      title: { type: Sequelize.STRING(255), allowNull: false, defaultValue: "Terms & Conditions" },
      intro: { type: Sequelize.TEXT, allowNull: true },
      // [{ id, title, body }] — the clauses the builder adds, in printed order.
      sections: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      footer_note: { type: Sequelize.TEXT, allowNull: true },

      version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      is_confirmed: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      confirmed_at: { type: Sequelize.DATE, allowNull: true },

      public_token: { type: Sequelize.STRING(64), allowNull: false },

      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_by: { type: Sequelize.UUID, allowNull: true },
      updated_by: { type: Sequelize.UUID, allowNull: true },

      ...timestamps(Sequelize),
    });
  }

  if (!existing.includes("quotation_version_terms")) {
    await queryInterface.createTable("quotation_version_terms", {
      quotation_version_terms_id: uuidPk(Sequelize),

      quotation_version_id: { type: Sequelize.UUID, allowNull: false },
      quotation_terms_id: { type: Sequelize.UUID, allowNull: true },
      company_id: { type: Sequelize.UUID, allowNull: true },
      builder_id: { type: Sequelize.UUID, allowNull: true },

      // { title, intro, sections, footerNote, version } as of the sync.
      terms_snapshot: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      terms_version: { type: Sequelize.INTEGER, allowNull: true },

      public_token: { type: Sequelize.STRING(64), allowNull: false },
      synced_at: { type: Sequelize.DATE, allowNull: true },

      created_by: { type: Sequelize.UUID, allowNull: true },
      updated_by: { type: Sequelize.UUID, allowNull: true },

      ...timestamps(Sequelize),
    });
  }

  await ensureIndexes(queryInterface);
}

export async function down(queryInterface) {
  const existing = await queryInterface.showAllTables();
  if (existing.includes("quotation_version_terms")) await queryInterface.dropTable("quotation_version_terms");
  if (existing.includes("quotation_terms")) await queryInterface.dropTable("quotation_terms");
}

export default { up, down };
