"use strict";

export default {
  up: async (queryInterface, Sequelize) => {
    const tables = await queryInterface.showAllTables();

    // 1. Add is_required flag to existing survey_template_questions (optional questions support)
    const questionColumns = await queryInterface.describeTable("survey_template_questions");
    if (!questionColumns.is_required) {
      await queryInterface.addColumn("survey_template_questions", "is_required", {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      });
    }

    // 2. survey_response — one row per survey sent to a lead
    if (!tables.includes("survey_response")) {
      await queryInterface.createTable("survey_response", {
        survey_response_id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal("gen_random_uuid()"),
          primaryKey: true,
          allowNull: false,
        },
        survey_template_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: "survey_template", key: "survey_template_id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },
        lead_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: "leads", key: "leads_id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },
        company_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: "company", key: "company_id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },
        builder_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: "builder", key: "builder_id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },
        recipient_name: { type: Sequelize.STRING(255), allowNull: true },
        recipient_email: { type: Sequelize.STRING(255), allowNull: false },
        access_token: { type: Sequelize.STRING(255), allowNull: false, unique: true },
        status: {
          type: Sequelize.ENUM("Sent", "Opened", "Completed"),
          allowNull: false,
          defaultValue: "Sent",
        },
        sent_by: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: "users", key: "users_id" },
          onUpdate: "CASCADE",
          onDelete: "SET NULL",
        },
        submitted_at: { type: Sequelize.DATE, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      });

      await queryInterface.addIndex("survey_response", ["access_token"], {
        name: "idx_survey_response_access_token",
        unique: true,
      });
      await queryInterface.addIndex("survey_response", ["lead_id"], {
        name: "idx_survey_response_lead_id",
      });
      await queryInterface.addIndex("survey_response", ["builder_id"], {
        name: "idx_survey_response_builder_id",
      });
    }

    // 3. survey_response_answer — one row per answered question (snapshotted)
    if (!tables.includes("survey_response_answer")) {
      await queryInterface.createTable("survey_response_answer", {
        survey_response_answer_id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal("gen_random_uuid()"),
          primaryKey: true,
          allowNull: false,
        },
        survey_response_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: "survey_response", key: "survey_response_id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },
        survey_question_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: "survey_template_questions", key: "survey_question_id" },
          onUpdate: "CASCADE",
          onDelete: "SET NULL",
        },
        question_description: { type: Sequelize.TEXT, allowNull: false },
        option_type: { type: Sequelize.STRING(50), allowNull: false },
        answer_text: { type: Sequelize.TEXT, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      });

      await queryInterface.addIndex("survey_response_answer", ["survey_response_id"], {
        name: "idx_survey_response_answer_response_id",
      });
    }
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("survey_response_answer");
    await queryInterface.dropTable("survey_response");
    // Postgres ENUM cleanup for survey_response.status
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_survey_response_status";');
    await queryInterface.removeColumn("survey_template_questions", "is_required");
  },
};
