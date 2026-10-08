"use strict";

export default {
  up: async (queryInterface, Sequelize) => {
    const tables = await queryInterface.showAllTables();
    if (tables.includes("job_customer_feedback")) {
      console.log("Table job_customer_feedback already exists, skipping creation.");
      return;
    }

    await queryInterface.createTable("job_customer_feedback", {
      job_customer_feedback_id: {
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
      template: {
        type: Sequelize.ENUM("Quality Feedback", "Customer sales Feedback"),
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM("Requested", "Completed", "Pending"),
        defaultValue: "Requested",
        allowNull: false,
      },
      requested_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: "users",
          key: "users_id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      submitted_by: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      comments: {
        type: Sequelize.TEXT,
        allowNull: true,
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

    await queryInterface.addIndex("job_customer_feedback", ["job_id"]);
    await queryInterface.addIndex("job_customer_feedback", ["company_id"]);
    await queryInterface.addIndex("job_customer_feedback", ["builder_id"]);
    await queryInterface.addIndex("job_customer_feedback", ["requested_by"]);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable("job_customer_feedback");
  },
};
