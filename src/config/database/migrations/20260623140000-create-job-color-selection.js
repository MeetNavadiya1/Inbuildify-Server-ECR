"use strict";

export async function up(queryInterface, Sequelize) {
  const tables = await queryInterface.showAllTables();
  if (tables.includes("job_color_selection")) return;

  await queryInterface.createTable("job_color_selection", {
    id: {
      type: Sequelize.UUID,
      defaultValue: Sequelize.literal("gen_random_uuid()"),
      primaryKey: true,
    },
    job_id: {
      type: Sequelize.UUID,
      allowNull: false,
      references: { model: "job", key: "job_id" },
      onDelete: "CASCADE",
    },
    color_item_id: {
      type: Sequelize.UUID,
      allowNull: false,
    },
    created_at: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.literal("NOW()"),
    },
    updated_at: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.literal("NOW()"),
    },
  });

  await queryInterface.addIndex("job_color_selection", ["job_id"], {
    name: "idx_job_color_selection_job_id",
  });
}

export async function down(queryInterface) {
  await queryInterface.dropTable("job_color_selection");
}
