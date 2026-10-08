"use strict";

export default {
  up: async (queryInterface, Sequelize) => {
    const tables = await queryInterface.showAllTables();

    if (!tables.includes("site_checkin_field")) {
      await queryInterface.createTable("site_checkin_field", {
        site_checkin_field_id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal("gen_random_uuid()"),
          primaryKey: true,
          allowNull: false,
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
        label: { type: Sequelize.STRING(255), allowNull: false },
        type: { type: Sequelize.STRING(30), allowNull: false, defaultValue: "text" },
        category: { type: Sequelize.STRING(30), allowNull: false, defaultValue: "other" },
        is_mandatory: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        display_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        created_by: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: "users", key: "users_id" },
          onDelete: "SET NULL",
        },
        updated_by: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: "users", key: "users_id" },
          onDelete: "SET NULL",
        },
        created_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
        updated_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      });
      await queryInterface.addIndex("site_checkin_field", ["company_id"]);
      await queryInterface.addIndex("site_checkin_field", ["builder_id"]);
    }

    if (!tables.includes("site_checkin_record")) {
      await queryInterface.createTable("site_checkin_record", {
        site_checkin_record_id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal("gen_random_uuid()"),
          primaryKey: true,
          allowNull: false,
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
        job_id: { type: Sequelize.STRING(255), allowNull: true },
        job_address: { type: Sequelize.STRING(255), allowNull: true },
        supplier_name: { type: Sequelize.STRING(255), allowNull: true },
        company_name: { type: Sequelize.STRING(255), allowNull: true },
        phone: { type: Sequelize.STRING(50), allowNull: true },
        email: { type: Sequelize.STRING(255), allowNull: true },
        responses: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
        status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: "PENDING" },
        checked_in_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
        confirmed_at: { type: Sequelize.DATE, allowNull: true },
        confirmed_by: { type: Sequelize.STRING(255), allowNull: true },
        builder_notes: { type: Sequelize.TEXT, allowNull: true },
        created_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
        updated_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      });
      await queryInterface.addIndex("site_checkin_record", ["company_id"]);
      await queryInterface.addIndex("site_checkin_record", ["builder_id"]);
      await queryInterface.addIndex("site_checkin_record", ["status"]);
    }
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("site_checkin_record");
    await queryInterface.dropTable("site_checkin_field");
  },
};
