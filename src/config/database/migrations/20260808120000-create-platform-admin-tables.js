"use strict";

const uuidPk = (Sequelize) => ({
  type: Sequelize.UUID,
  defaultValue: Sequelize.literal("gen_random_uuid()"),
  primaryKey: true,
  allowNull: false,
});

const timestamps = (Sequelize) => ({
  created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
  updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
});

export async function up(queryInterface, Sequelize) {
  const existing = await queryInterface.showAllTables();
  const has = (table) => existing.includes(table);

  if (!has("platform_role")) {
    await queryInterface.createTable("platform_role", {
      platform_role_id: uuidPk(Sequelize),
      name: { type: Sequelize.STRING(100), allowNull: false, unique: true },
      scope: { type: Sequelize.STRING(120), allowNull: true },
      description: { type: Sequelize.TEXT, allowNull: true },
      permissions: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      is_system: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      ...timestamps(Sequelize),
    });
  }

  if (!has("platform_user")) {
    await queryInterface.createTable("platform_user", {
      platform_user_id: uuidPk(Sequelize),
      name: { type: Sequelize.STRING(150), allowNull: false },
      email: { type: Sequelize.STRING(255), allowNull: false, unique: true },
      password: { type: Sequelize.STRING(255), allowNull: false },
      platform_role_id: { type: Sequelize.UUID, allowNull: true },
      phone: { type: Sequelize.STRING(30), allowNull: true },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      last_login_at: { type: Sequelize.DATE, allowNull: true },
      failed_attempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      created_by: { type: Sequelize.UUID, allowNull: true },
      updated_by: { type: Sequelize.UUID, allowNull: true },
      ...timestamps(Sequelize),
    });
    await queryInterface.addIndex("platform_user", ["platform_role_id"], { name: "platform_user_role_idx" });
  }

  const activityIndexes = await queryInterface.showIndex("activity_logs");
  if (!activityIndexes.some((i) => i.name === "activity_logs_created_at_idx")) {
    await queryInterface.addIndex("activity_logs", ["created_at"], { name: "activity_logs_created_at_idx" });
  }
}

export async function down(queryInterface) {
  const existing = await queryInterface.showAllTables();
  const drop = async (table) => {
    if (existing.includes(table)) await queryInterface.dropTable(table);
  };

  await drop("platform_user");
  await drop("platform_role");

  const activityIndexes = await queryInterface.showIndex("activity_logs");
  if (activityIndexes.some((i) => i.name === "activity_logs_created_at_idx")) {
    await queryInterface.removeIndex("activity_logs", "activity_logs_created_at_idx");
  }
}
