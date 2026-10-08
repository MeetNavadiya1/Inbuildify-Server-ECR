"use strict";

/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface, Sequelize) {
  const tables = await queryInterface.showAllTables();

  /* ================= job_sub_stage ================= */
  if (!tables.includes("job_sub_stage")) {
    await queryInterface.createTable("job_sub_stage", {
      sub_stage_id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      job_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "job", key: "job_id" },
        onDelete: "CASCADE",
      },
      stage_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "job_process_stage", key: "stage_id" },
        onDelete: "CASCADE",
      },
      name: { type: Sequelize.STRING(200), allowNull: false },
      sort_order: { type: Sequelize.INTEGER, allowNull: false },
      is_completed: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      is_skipped: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal("NOW()") },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal("NOW()") },
    });

    await queryInterface.addIndex("job_sub_stage", ["job_id", "stage_id"], {
      name: "idx_job_sub_stage_job_stage",
    });
  }

  /* ================= job_task ================= */
  if (!tables.includes("job_task")) {
    await queryInterface.createTable("job_task", {
      job_process_task_id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      job_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "job", key: "job_id" },
        onDelete: "CASCADE",
      },
      sub_stage_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "job_sub_stage", key: "sub_stage_id" },
        onDelete: "CASCADE",
      },
      name: { type: Sequelize.STRING(200), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      sort_order: { type: Sequelize.INTEGER, allowNull: false },
      folder_id: { type: Sequelize.UUID, allowNull: true },
      no_of_days: { type: Sequelize.INTEGER, allowNull: true },
      assignee_id: { type: Sequelize.UUID, allowNull: true },
      notify: { type: Sequelize.BOOLEAN, defaultValue: false },
      milestone: { type: Sequelize.BOOLEAN, defaultValue: false },
      attachment_mandatory: { type: Sequelize.BOOLEAN, defaultValue: false },
      is_completed: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      actual_date: { type: Sequelize.DATEONLY, allowNull: true },
      notes: { type: Sequelize.TEXT, allowNull: true },
      attachments: { type: Sequelize.JSONB, allowNull: true },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal("NOW()") },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal("NOW()") },
    });

    await queryInterface.addIndex("job_task", ["sub_stage_id"], {
      name: "idx_job_task_sub_stage",
    });
    await queryInterface.addIndex("job_task", ["job_id"], {
      name: "idx_job_task_job_id",
    });
  }

  /* ================= job_subtask ================= */
  if (!tables.includes("job_subtask")) {
    await queryInterface.createTable("job_subtask", {
      job_process_subtask_id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      job_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "job", key: "job_id" },
        onDelete: "CASCADE",
      },
      job_process_task_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "job_task", key: "job_process_task_id" },
        onDelete: "CASCADE",
      },
      name: { type: Sequelize.STRING(200), allowNull: false },
      sort_order: { type: Sequelize.INTEGER, allowNull: false },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal("NOW()") },
    });

    await queryInterface.addIndex("job_subtask", ["job_process_task_id"], {
      name: "idx_job_subtask_task",
    });
  }

  /* ================= job_task_dependency ================= */
  if (!tables.includes("job_task_dependency")) {
    await queryInterface.createTable("job_task_dependency", {
      task_id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        references: { model: "job_task", key: "job_process_task_id" },
        onDelete: "CASCADE",
      },
      predecessor_task_id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        references: { model: "job_task", key: "job_process_task_id" },
        onDelete: "CASCADE",
      },
    });
  }
}

export async function down(queryInterface) {
  await queryInterface.dropTable("job_task_dependency");
  await queryInterface.dropTable("job_subtask");
  await queryInterface.dropTable("job_task");
  await queryInterface.dropTable("job_sub_stage");
}
