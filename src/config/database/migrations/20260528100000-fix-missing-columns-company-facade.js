"use strict";

/**
 * Fix migration: applies columns that were recorded in SequelizeMeta
 * but never actually added to the database.
 *
 * Missing columns detected in sahil5 (and any DB where the original
 * migrations were marked executed but silently skipped):
 *
 *  1. company.is_onboarding_finished  (from 20260521120000)
 *  2. company.website                 (from 20260522130500)
 *  3. facade.image_reference          (from 20260511142000)
 */

export async function up(queryInterface, Sequelize) {
  const companyInfo = await queryInterface.describeTable("company");
  const facadeInfo = await queryInterface.describeTable("facade");

  // 1. company.is_onboarding_finished
  if (!companyInfo.is_onboarding_finished) {
    await queryInterface.addColumn("company", "is_onboarding_finished", {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    });
    console.log("✅ Added company.is_onboarding_finished");
  } else {
    console.log("⏭️  company.is_onboarding_finished already exists, skipping");
  }

  // 2. company.website
  if (!companyInfo.website) {
    await queryInterface.addColumn("company", "website", {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
    console.log("✅ Added company.website");
  } else {
    console.log("⏭️  company.website already exists, skipping");
  }

  // 3. facade.image_reference
  if (!facadeInfo.image_reference) {
    await queryInterface.addColumn("facade", "image_reference", {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: "drive_files",
        key: "file_id",
      },
      onDelete: "SET NULL",
    });
    console.log("✅ Added facade.image_reference");
  } else {
    console.log("⏭️  facade.image_reference already exists, skipping");
  }
}

export async function down(queryInterface) {
  const companyInfo = await queryInterface.describeTable("company");
  const facadeInfo = await queryInterface.describeTable("facade");

  if (companyInfo.website) {
    await queryInterface.removeColumn("company", "website");
  }
  if (companyInfo.is_onboarding_finished) {
    await queryInterface.removeColumn("company", "is_onboarding_finished");
  }
  if (facadeInfo.image_reference) {
    await queryInterface.removeColumn("facade", "image_reference");
  }
}
