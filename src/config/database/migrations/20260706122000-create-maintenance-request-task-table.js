"use strict";

export default {
  up: async (queryInterface, Sequelize) => {
    const tables = await queryInterface.showAllTables();
    if (tables.includes("maintenance_request_task")) {
      console.log("Table maintenance_request_task already exists, skipping creation.");
      return;
    }

    await queryInterface.createTable("maintenance_request_task", {
      maintenance_request_task_id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      maintenance_request_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "maintenance_request",
          key: "maintenance_request_id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      title: {
        type: Sequelize.STRING(500),
        allowNull: false,
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      is_completed: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      sort_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: "users",
          key: "users_id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      updated_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: "users",
          key: "users_id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
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

    await queryInterface.addIndex("maintenance_request_task", ["maintenance_request_id"]);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable("maintenance_request_task");
  },
};
