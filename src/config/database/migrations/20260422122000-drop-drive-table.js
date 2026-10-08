"use strict";

/**
 * Migration to drop the 'drive' table.
 */
export default {
  async up(queryInterface) {
    // No-op: Dropping the table breaks fresh database setups 
    // because sync() creates it and no subsequent migration recreates it.
    console.log("Skipping drop-drive-table migration to preserve table structure.");
  },

  async down(queryInterface, Sequelize) {
    // Re-create the table in case of rollback
    await queryInterface.createTable("drive", {
      drive_id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      company_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "company", key: "company_id" },
      },
      builder_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "builder", key: "builder_id" },
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "user_id" },
      },
      updated_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "user_id" },
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });
  },
};
