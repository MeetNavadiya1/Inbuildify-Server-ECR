"use strict";

export default {
  up: async (queryInterface, Sequelize) => {
    const tables = await queryInterface.showAllTables();
    if (tables.includes("maintenance_request")) {
      console.log("Table maintenance_request already exists, skipping creation.");
      return;
    }

    await queryInterface.createTable("maintenance_request", {
      maintenance_request_id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      maintenance_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "maintenance",
          key: "maintenance_id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      reference_number: {
        type: Sequelize.STRING(40),
        allowNull: false,
        unique: true,
      },
      supplier: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      start_date: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      finish_date: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      complete_date: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "Pending",
      },
      amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      builder_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: "builder",
          key: "builder_id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      company_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: "company",
          key: "company_id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
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

    await queryInterface.addIndex("maintenance_request", ["maintenance_id"]);
    await queryInterface.addIndex("maintenance_request", ["status"]);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable("maintenance_request");
  },
};
