"use strict";

export async function up(queryInterface, Sequelize) {
  const usersTableInfo = await queryInterface.describeTable("users");
  if (!usersTableInfo.auth_provider) {
    await queryInterface.addColumn("users", "auth_provider", {
      type: Sequelize.ENUM("local", "google", "apple"),
      allowNull: false,
      defaultValue: "local",
    });
  }

  // Create table user_social_accounts if not exists
  const tableExists = await queryInterface.sequelize.query(
    `SELECT EXISTS (
       SELECT FROM information_schema.tables 
       WHERE table_name = 'user_social_accounts'
     );`
  );
  const exists = tableExists[0][0].exists;

  if (!exists) {
    await queryInterface.createTable("user_social_accounts", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "users",
          key: "users_id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      provider: {
        type: Sequelize.ENUM("google", "apple"),
        allowNull: false,
      },
      provider_user_id: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      profile_data: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    await queryInterface.addIndex("user_social_accounts", ["provider", "provider_user_id"], {
      unique: true,
      name: "user_social_accounts_provider_provider_user_id_unique",
    });
  }
}

export async function down(queryInterface, Sequelize) {
  // Drop user_social_accounts table
  await queryInterface.dropTable("user_social_accounts");
  
  // Drop ENUM types
  await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_user_social_accounts_provider";');

  // Remove auth_provider column
  const usersTableInfo = await queryInterface.describeTable("users");
  if (usersTableInfo.auth_provider) {
    await queryInterface.removeColumn("users", "auth_provider");
  }
  
  await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_users_auth_provider";');
}
