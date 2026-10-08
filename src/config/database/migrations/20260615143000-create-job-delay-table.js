"use strict";

export default {
  up: async (queryInterface, Sequelize) => {
    const tables = await queryInterface.showAllTables();
    if (tables.includes("job_delay")) {
      console.log("Table job_delay already exists, skipping creation.");
      return;
    }

    await queryInterface.createTable("job_delay", {
      job_delay_id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      job_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "job",
          key: "job_id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      company_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: "company",
          key: "company_id",
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
        onDelete: "CASCADE",
      },
      reason: {
        type: Sequelize.ENUM("Private Inspection", "Materials", "Weather", "Variation", "Permits", "Others"),
        allowNull: false,
      },
      no_of_days: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      from_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      to_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      send_mail: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false,
      },
      status: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        defaultValue: ["EMAIL NOT SENT", "DATE NOT RECALCULATED"],
        allowNull: false,
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

    await queryInterface.addIndex("job_delay", ["job_id"]);
    await queryInterface.addIndex("job_delay", ["company_id"]);
    await queryInterface.addIndex("job_delay", ["builder_id"]);
    await queryInterface.addIndex("job_delay", ["created_by"]);
    await queryInterface.addIndex("job_delay", ["updated_by"]);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable("job_delay");
  },
};
