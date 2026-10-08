"use strict";

export default {
  up: async (queryInterface, Sequelize) => {
    const tables = await queryInterface.showAllTables();
    if (tables.includes("maintenance")) {
      console.log("Table maintenance already exists, skipping creation.");
      return;
    }

    await queryInterface.createTable("maintenance", {
      maintenance_id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      job_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: {
          model: "job",
          key: "job_id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
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
      supervisor_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: "users",
          key: "users_id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      customer_contact_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: "users",
          key: "users_id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      status: {
        type: Sequelize.STRING(30),
        allowNull: false,
        defaultValue: "readyformaintenance",
      },
      pci_date: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      occupancy_permit_date: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      handover_date: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      request_sequence: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      completed_at: {
        type: Sequelize.DATE,
        allowNull: true,
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

    await queryInterface.addIndex("maintenance", ["builder_id"]);
    await queryInterface.addIndex("maintenance", ["company_id"]);
    await queryInterface.addIndex("maintenance", ["supervisor_id"]);
    await queryInterface.addIndex("maintenance", ["customer_contact_id"]);
    await queryInterface.addIndex("maintenance", ["status"]);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable("maintenance");
  },
};
