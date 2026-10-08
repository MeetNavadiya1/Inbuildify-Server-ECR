"use strict";

/**
 * Sample data is no longer imported on demand — a user raises a request, the
 * Company Administrator is emailed, and the import only runs once they approve.
 * This table is the request record and drives the status shown in Settings →
 * Sample Data (pending / approved / rejected / failed).
 */
export default {
  up: async (queryInterface, Sequelize) => {
    const tables = await queryInterface.showAllTables();
    if (tables.includes("sample_data_request")) return;

    await queryInterface.createTable("sample_data_request", {
      sample_data_request_id: {
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
      // PENDING | APPROVED | REJECTED | FAILED
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: "PENDING" },
      // Single-use secret in the emailed approve/reject link. Per-request rather
      // than a shared app secret, so possessing the link authorises this one
      // decision and nothing else.
      approval_token: { type: Sequelize.STRING(100), allowNull: false, unique: true },
      requested_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "users_id" },
        onDelete: "SET NULL",
      },
      approver_user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "users_id" },
        onDelete: "SET NULL",
      },
      // Snapshot of where the request was emailed, so the UI can show it even if
      // the approver's address later changes.
      approver_email: { type: Sequelize.STRING(255), allowNull: true },
      decided_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "users_id" },
        onDelete: "SET NULL",
      },
      decided_at: { type: Sequelize.DATE, allowNull: true },
      decision_note: { type: Sequelize.TEXT, allowNull: true },
      // Populated when an approved import throws, so the screen can explain why
      // no data appeared instead of sitting on "approved" with nothing to show.
      error_message: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    });

    await queryInterface.addIndex("sample_data_request", ["company_id", "status"], {
      name: "sample_data_request_company_status_idx",
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("sample_data_request");
  },
};
