/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    const tableExists = await queryInterface.tableExists("job_activity_log");
    if (tableExists) return;

    await queryInterface.createTable("job_activity_log", {
      job_activity_log_id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      job_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "job", key: "job_id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "users_id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      module: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      module_id: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      record_name: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      action: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      field_name: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      old_value: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      new_value: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
      },
    });

    await queryInterface.addIndex("job_activity_log", ["job_id", "created_at"], {
      name: "idx_job_activity_log_job_created",
      order: [["created_at", "DESC"]],
    });
    await queryInterface.addIndex("job_activity_log", ["module_id"], {
      name: "idx_job_activity_log_module_id",
    });
    await queryInterface.addIndex("job_activity_log", ["module"], {
      name: "idx_job_activity_log_module",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("job_activity_log");
  },
};
