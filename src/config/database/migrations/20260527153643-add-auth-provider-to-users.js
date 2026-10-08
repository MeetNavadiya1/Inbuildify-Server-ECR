"use strict";

export async function up(queryInterface, Sequelize) {
  const tableInfo = await queryInterface.describeTable("users");

  if (tableInfo.auth_provider) {
    console.log("Column 'auth_provider' already exists in 'users' table. Skipping migration up.");
    return;
  }

  // Ensure enum type exists in PostgreSQL
  await queryInterface.sequelize.query(`
    DO $$ BEGIN
      CREATE TYPE "enum_users_auth_provider" AS ENUM ('local', 'google', 'apple');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  try {
    await queryInterface.addColumn("users", "auth_provider", {
      type: Sequelize.ENUM("local", "google", "apple"),
      allowNull: false,
      defaultValue: "local",
    });
  } catch (err) {
    if (err.message.includes("already exists")) {
      await queryInterface.sequelize.query(`
        ALTER TABLE "users" ADD COLUMN "auth_provider" "enum_users_auth_provider" NOT NULL DEFAULT 'local';
      `);
    } else {
      throw err;
    }
  }
}

export async function down(queryInterface, Sequelize) {
  const tableInfo = await queryInterface.describeTable("users");

  if (tableInfo.auth_provider) {
    await queryInterface.removeColumn("users", "auth_provider");
  }

  await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_users_auth_provider";');
}
