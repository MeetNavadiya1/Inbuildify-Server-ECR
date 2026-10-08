"use strict";

/**
 * Task extension requests.
 *
 * A builder asks selected stakeholders for extra days on a workflow task. The
 * request is emailed with a tokenised link; the first recipient to respond
 * decides it (the same accept-from-email flow as job completion approval). On
 * approval the task's duration grows by `extension_days` and the job's whole
 * schedule is re-derived from it.
 *
 * Job tasks only — a template task has no schedule to extend, so `task_id`
 * points at job_task.
 *
 * `requested_duration_days` and `max_extension_days` are SNAPSHOTS taken when
 * the request was raised. The cap is derived from the task's duration at that
 * moment, and the duration can move (another approved extension, a manual
 * edit), so storing both keeps the record explaining itself later.
 */

/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface, Sequelize) {
  const tables = await queryInterface.showAllTables();
  if (tables.includes("job_task_extension_request")) return;

  await queryInterface.createTable("job_task_extension_request", {
    job_task_extension_request_id: {
      type: Sequelize.UUID,
      defaultValue: Sequelize.literal("gen_random_uuid()"),
      primaryKey: true,
    },
    task_id: {
      type: Sequelize.UUID,
      allowNull: false,
      references: { model: "job_task", key: "job_process_task_id" },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    job_id: {
      type: Sequelize.UUID,
      allowNull: false,
      references: { model: "job", key: "job_id" },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    builder_id: { type: Sequelize.UUID, allowNull: true },
    company_id: { type: Sequelize.UUID, allowNull: true },

    subject: { type: Sequelize.STRING(255), allowNull: true },
    // The HTML message the builder composed and reviewed before sending, as
    // edited in the panel. Kept so the sent email can be shown back verbatim.
    email_body: { type: Sequelize.TEXT, allowNull: true },
    reason: { type: Sequelize.TEXT, allowNull: false },
    // What the builder asked for. What was actually granted is approved_days —
    // the responder may allow fewer (or more, up to the cap) than requested, so
    // the two are kept apart rather than the request being overwritten.
    extension_days: { type: Sequelize.INTEGER, allowNull: false },
    approved_days: { type: Sequelize.INTEGER, allowNull: true },
    // Snapshots — see the note above.
    requested_duration_days: { type: Sequelize.INTEGER, allowNull: true },
    max_extension_days: { type: Sequelize.INTEGER, allowNull: true },

    // [{ usersId, name, email, roleName }] resolved server-side at send time, so
    // the record shows who was actually asked even if a user is later changed.
    recipients: { type: Sequelize.JSONB, allowNull: true },
    // drive_files ids, matching how job_task.attachments stores them.
    attachments: { type: Sequelize.JSONB, allowNull: true },

    status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: "PENDING" },
    response_comments: { type: Sequelize.STRING(1000), allowNull: true },
    // Free text rather than a FK: the responder acts from an email link and is
    // matched by address, so they need not be a user row at all.
    responded_by_email: { type: Sequelize.STRING(255), allowNull: true },
    responded_at: { type: Sequelize.DATE, allowNull: true },

    requested_by: {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "users", key: "users_id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    },
    sent_at: { type: Sequelize.DATE, allowNull: true },

    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
  });

  // The task row reads "is there an open request?" on every workflow load.
  await queryInterface.addIndex("job_task_extension_request", ["task_id", "status"], {
    name: "job_task_extension_request_task_status_idx",
  });
}

export async function down(queryInterface) {
  await queryInterface.removeIndex(
    "job_task_extension_request",
    "job_task_extension_request_task_status_idx",
  );
  await queryInterface.dropTable("job_task_extension_request");
}
