"use strict";

/**
 * job_variation — post-contract variations raised against a job. One row per
 * variation version (reference_id like "MYH00486-V1"). Mirrors the job_delay
 * table conventions (tenant columns + created/updated_by FKs to users).
 */
export default {
  up: async (queryInterface, Sequelize) => {
    const tables = await queryInterface.showAllTables();
    if (tables.includes("job_variation")) {
      console.log("Table job_variation already exists, skipping creation.");
      return;
    }

    await queryInterface.createTable("job_variation", {
      variation_id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      job_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "job", key: "job_id" },
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
      // Human-readable id, e.g. "MYH00486-V1" (job reference + version).
      reference_id: { type: Sequelize.STRING(60), allowNull: true },
      version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      title: { type: Sequelize.STRING(255), allowNull: true },
      amount: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      requested_by: { type: Sequelize.STRING(255), allowNull: true },
      delayed_by: { type: Sequelize.STRING(255), allowNull: true },
      delayed_days: { type: Sequelize.INTEGER, allowNull: true },
      drawing_changes_required: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: "draft" },
      // Optional link to an invoice (no hard FK to keep it decoupled).
      invoice_id: { type: Sequelize.UUID, allowNull: true },
      // Variation line items (additional / site cost / qty / price / total ...).
      items: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      approved_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "users_id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      approved_at: { type: Sequelize.DATEONLY, allowNull: true },
      created_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "users_id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      updated_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "users_id" },
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

    await queryInterface.addIndex("job_variation", ["job_id"]);
    await queryInterface.addIndex("job_variation", ["company_id"]);
    await queryInterface.addIndex("job_variation", ["builder_id"]);
    await queryInterface.addIndex("job_variation", ["created_by"]);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("job_variation");
  },
};
