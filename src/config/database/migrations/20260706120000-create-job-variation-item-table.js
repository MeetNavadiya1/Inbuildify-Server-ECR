"use strict";

export default {
  up: async (queryInterface, Sequelize) => {
    const tables = await queryInterface.showAllTables();
    if (tables.includes("job_variation_item")) {
      console.log("Table job_variation_item already exists, skipping creation.");
      return;
    }

    await queryInterface.createTable("job_variation_item", {
      job_variation_item_id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      variation_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "job_variation", key: "variation_id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      price_list_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "price_list", key: "price_list_id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      price_list_item_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "price_list_item", key: "price_list_item_id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      additional: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      site_cost: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      cost: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      drawing_changes: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      quantity: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true,
      },
      price: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true,
      },
      total: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true,
      },
      item_type: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      uom: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      range_id: {
        type: Sequelize.ARRAY(Sequelize.UUID),
        defaultValue: [],
      },
      dwelling_type_id: {
        type: Sequelize.ARRAY(Sequelize.UUID),
        defaultValue: [],
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.addIndex("job_variation_item", ["variation_id"]);
    await queryInterface.addIndex("job_variation_item", ["price_list_item_id"]);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("job_variation_item");
  },
};
