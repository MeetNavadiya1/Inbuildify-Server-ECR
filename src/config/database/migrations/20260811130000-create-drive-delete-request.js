"use strict";

/**
 * Delete requests raised on shared drive items.
 *
 * Someone the item was shared with at EDIT or ADMIN cannot delete it outright —
 * they raise a request, the owner is emailed a tokenised review link, and only
 * their approval moves the item to Trash. Same accept-from-email shape as
 * job_task_extension_request, minus the recipient fan-out: a drive item has
 * exactly one owner, so exactly one person decides.
 *
 * `entity_name` and `owner_email` are SNAPSHOTS taken when the request was
 * raised. The item can be renamed, and the owner's address can change, before
 * the decision arrives — storing both keeps the record explaining itself.
 *
 * `access_token` is the link's secret. The public routes are guarded by the
 * shared external token, which does not identify a request, so a caller must
 * also present this per-request value — otherwise anyone holding the app-wide
 * secret could approve a deletion by guessing an id.
 */

/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface, Sequelize) {
  const tables = await queryInterface.showAllTables();
  if (tables.includes("drive_delete_request")) return;

  await queryInterface.createTable("drive_delete_request", {
    drive_delete_request_id: {
      type: Sequelize.UUID,
      defaultValue: Sequelize.literal("gen_random_uuid()"),
      primaryKey: true,
    },
    company_id: { type: Sequelize.UUID, allowNull: false },

    // No FK: the target lives in one of two tables (drive / drive_files), and
    // both are soft-deleted, so the row must survive the delete it authorised.
    entity_type: { type: Sequelize.STRING(10), allowNull: false },
    entity_id: { type: Sequelize.UUID, allowNull: false },
    entity_name: { type: Sequelize.STRING(255), allowNull: true },

    reason: { type: Sequelize.TEXT, allowNull: true },

    requested_by: {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "users", key: "users_id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    },
    // The item's creator (folder) or uploader (file) — the only person who can
    // decide this request.
    owner_id: {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "users", key: "users_id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    },
    owner_email: { type: Sequelize.STRING(255), allowNull: true },

    access_token: {
      type: Sequelize.UUID,
      allowNull: false,
      defaultValue: Sequelize.literal("gen_random_uuid()"),
    },

    status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: "PENDING" },
    response_comments: { type: Sequelize.STRING(1000), allowNull: true },
    // Free text rather than a FK: the owner answers from an email link, so they
    // are matched by address rather than by session.
    responded_by_email: { type: Sequelize.STRING(255), allowNull: true },
    responded_at: { type: Sequelize.DATE, allowNull: true },

    sent_at: { type: Sequelize.DATE, allowNull: true },

    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
  });

  // "Is a request already open on this item?" — checked before every new one.
  await queryInterface.addIndex("drive_delete_request", ["entity_type", "entity_id", "status"], {
    name: "drive_delete_request_entity_status_idx",
  });
}

export async function down(queryInterface) {
  await queryInterface.removeIndex(
    "drive_delete_request",
    "drive_delete_request_entity_status_idx",
  );
  await queryInterface.dropTable("drive_delete_request");
}
