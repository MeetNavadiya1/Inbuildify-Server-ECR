"use strict";

export async function up(queryInterface, Sequelize) {
  const tableInfo = await queryInterface.describeTable("job");
  if (!tableInfo.tracking_token) {
    await queryInterface.addColumn("job", "tracking_token", {
      type: Sequelize.UUID,
      defaultValue: Sequelize.literal("gen_random_uuid()"),
      allowNull: true,
    });

    // Populate existing jobs with a random UUID
    await queryInterface.sequelize.query(
      `UPDATE "job" SET "tracking_token" = gen_random_uuid() WHERE "tracking_token" IS NULL`
    );

    // Alter column to be NOT NULL now that it is populated
    await queryInterface.changeColumn("job", "tracking_token", {
      type: Sequelize.UUID,
      defaultValue: Sequelize.literal("gen_random_uuid()"),
      allowNull: false,
    });

    // Add unique index on tracking_token
    await queryInterface.addIndex("job", ["tracking_token"], {
      unique: true,
      name: "job_tracking_token_unique_idx",
    });
  }
}

export async function down(queryInterface, Sequelize) {
  await queryInterface.removeIndex("job", "job_tracking_token_unique_idx");
  await queryInterface.removeColumn("job", "tracking_token");
}
