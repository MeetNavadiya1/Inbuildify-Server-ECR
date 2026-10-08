"use strict";

/**
 * `blog_post` — articles written in the admin console for the landing site's
 * /blog.
 *
 * The six existing posts stay hard-coded in the landing repo; this table is
 * everything added since, and the site renders the two together. A row is a
 * draft until an admin toggles `is_active`, which is why the column defaults to
 * false and the public endpoints filter on it.
 *
 * Indexes are created outside the table guard: the server calls `.sync()` on
 * boot, so the table may already exist from the model (which carries the
 * columns but not these indexes).
 */

const TABLE = "blog_post";

async function ensureIndexes(queryInterface) {
  const statements = [
    `CREATE UNIQUE INDEX IF NOT EXISTS blog_post_slug_key ON ${TABLE} (slug)`,
    `CREATE INDEX IF NOT EXISTS blog_post_live_idx ON ${TABLE} (is_active, published_at DESC)`,
    `CREATE INDEX IF NOT EXISTS blog_post_category_idx ON ${TABLE} (category)`,
  ];

  for (const sql of statements) {
    await queryInterface.sequelize.query(sql);
  }
}

export async function up(queryInterface, Sequelize) {
  const existing = await queryInterface.showAllTables();

  if (!existing.includes(TABLE)) {
    await queryInterface.createTable(TABLE, {
      blog_post_id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },

      slug: { type: Sequelize.STRING(220), allowNull: false, unique: true },

      title: { type: Sequelize.STRING(255), allowNull: false },
      seo_title: { type: Sequelize.STRING(255), allowNull: true },
      description: { type: Sequelize.TEXT, allowNull: true },
      excerpt: { type: Sequelize.TEXT, allowNull: true },

      category: { type: Sequelize.STRING(80), allowNull: false, defaultValue: "Business Tips" },
      read_time: { type: Sequelize.STRING(30), allowNull: true },
      keywords: { type: Sequelize.ARRAY(Sequelize.TEXT), allowNull: false, defaultValue: [] },

      image: { type: Sequelize.STRING(1000), allowNull: true },
      image_key: { type: Sequelize.STRING(1000), allowNull: true },

      content: { type: Sequelize.TEXT, allowNull: true },
      body: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },

      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      published_at: { type: Sequelize.DATE, allowNull: true },

      created_by: { type: Sequelize.UUID, allowNull: true },
      updated_by: { type: Sequelize.UUID, allowNull: true },

      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });
  }

  await ensureIndexes(queryInterface);
}

export async function down(queryInterface) {
  const existing = await queryInterface.showAllTables();
  if (existing.includes(TABLE)) await queryInterface.dropTable(TABLE);
}

export default { up, down };
