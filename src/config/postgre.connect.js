import db, { initModels } from "../config/database/models/postgre-models/index.js";
import { runPendingMigrations } from "../config/database/migrationRunner.js";
import { ensureDatabase } from "./db-bootstrap.js";
import { runDeveloperEssentialSeeds } from "../seeder/seedDeveloperEssentials.js";

export const connectPostgre = async () => {
  try {
    // Step 1: Ensure database exists (create if needed)
    const { created } = await ensureDatabase();

    // Step 2: Initialize Sequelize models
    console.time("⏱️  Model Initialization");
    await initModels();
    console.timeEnd("⏱️  Model Initialization");

    // Step 3: Authenticate
    console.time("⏱️  Database Authentication");
    await db.sequelize.authenticate();
    console.timeEnd("⏱️  Database Authentication");

    // Add sync-helper columns if they don't exist
    await db.sequelize.query(`
      ALTER TABLE job_color_category ADD COLUMN IF NOT EXISTS template_category_id UUID;
      ALTER TABLE job_color_item ADD COLUMN IF NOT EXISTS template_item_id UUID;
      ALTER TABLE job_color_sub_category ADD COLUMN IF NOT EXISTS template_sub_category_id UUID;
    `);

    // Safe & Fast Verification: Check for missing tables in one go
    console.time("⏱️  Database Verification");
    const existingTables = await db.sequelize.getQueryInterface().showAllTables();
    const modelNames = Object.keys(db).filter(key => !["sequelize", "Sequelize"].includes(key));

    if (created || existingTables.length === 0) {
      // 100% fresh database: sync models to create tables with correct FK order, then run migrations.
      console.log(`⚠️  Fresh database detected. Running full sync...`);
      await db.sequelize.sync();
      
      console.time("⏱️  Migrations");
      await runPendingMigrations(db.sequelize);
      console.timeEnd("⏱️  Migrations");
    } else {
    const missingTables = modelNames.filter(name => {
      const tableName = db[name].tableName;
      return !existingTables.includes(tableName);
    });

    if (missingTables.length > 0) {
      console.log(`⚠️  Detected ${missingTables.length} missing tables. Syncing missing models only...`);
      for (const modelName of missingTables) {
        await db[modelName].sync();
      }
    } else {
      // Existing database: run migrations FIRST so existing tables get new columns before sync tries to add indexes.
      console.time("⏱️  Migrations");
      await runPendingMigrations(db.sequelize);
      console.timeEnd("⏱️  Migrations");

      // Now check if any tables are still missing (e.g. models added without explicit CREATE TABLE migrations)
      const updatedExistingTables = await db.sequelize.getQueryInterface().showAllTables();
      const missingTables = modelNames.filter(name => !updatedExistingTables.includes(db[name].tableName));

      if (missingTables.length > 0) {
        console.log(`⚠️  Detected ${missingTables.length} missing tables after migrations. Running sync...`);
        await db.sequelize.sync();
      } else {
        console.log("✅ All tables verified.");
      }
    }
    }
    console.timeEnd("⏱️  Database Verification");


    // Step 4: Auto-seed essentials if database was just created
    if (created) {
      console.log("🌱 New database detected — running essential seeds...");
      console.time("⏱️  Seeding");
      await runDeveloperEssentialSeeds();
      console.timeEnd("⏱️  Seeding");
    }

  } catch (error) {
    console.error("Database connection error:", error);
    throw error;
  }
};

export default db;
