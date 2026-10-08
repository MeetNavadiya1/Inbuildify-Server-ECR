"use strict";

export async function up(queryInterface, Sequelize) {
  const tableInfo = await queryInterface.describeTable("users");

  if (!tableInfo.company_id) {
    await queryInterface.addColumn("users", "company_id", {
      type: Sequelize.UUID,
      allowNull: true,
    });
  }

  // Company Administrator users belong directly to a Company and never sit
  // under a Builder. Builder_id must become nullable to support that.
  if (tableInfo.builder_id && tableInfo.builder_id.allowNull === false) {
    await queryInterface.changeColumn("users", "builder_id", {
      type: Sequelize.UUID,
      allowNull: true,
    });
  }
}

export async function down(queryInterface, Sequelize) {
  const tableInfo = await queryInterface.describeTable("users");

  if (tableInfo.builder_id && tableInfo.builder_id.allowNull === true) {
    await queryInterface.changeColumn("users", "builder_id", {
      type: Sequelize.UUID,
      allowNull: false,
    });
  }
  if (tableInfo.company_id) {
    await queryInterface.removeColumn("users", "company_id");
  }
}
