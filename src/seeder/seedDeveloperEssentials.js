import db, { initModels } from "../config/database/models/postgre-models/index.js";
import { seedRoles } from "./seedRoles.js";
import { seedCountriesAndStates } from "./seedCountriesAndStates.js";
import { seedTimezones } from "./seed-timezones.js";
import { seedScreensAndFunctionalities } from "./seed-screens-functionalities.js";
import { seedCustomFieldModules } from "./seed-custom-field-module.js";
import { seedComplianceTypes } from "./seed-compliance-type.js";
import { seedRoleTypes } from "./seed-role-type.js";
import { seedJobProcessStageFunctionalities } from "./seed-job-process-stage-functionality.js";
import { seedPlatformAdmin } from "./seedPlatformAdmin.js";

/**
 * Core seeding logic — can be called from connectPostgre or run standalone.
 * Does NOT call initModels() or process.exit() — caller is responsible for that.
 */
export const runDeveloperEssentialSeeds = async () => {
  console.log("🚀 Starting Developer Essentials Seeding...");

  // 1. Seed Roles
  await seedRoles();

  // 1.1 Seed Role Types
  await seedRoleTypes();

  // 2. Seed Countries and States
  await seedCountriesAndStates();

  // 3. Seed Timezones
  await seedTimezones();

  // 4. Seed Screens and Functionalities
  await seedScreensAndFunctionalities();

  // 5. Seed Custom Field Modules
  await seedCustomFieldModules();

  // 6. Seed Compliance Types
  await seedComplianceTypes();

  // 7. Seed Job Process Stage Functionalities
  await seedJobProcessStageFunctionalities();

  // 8. Seed Platform Admin roles, settings and the first super admin
  await seedPlatformAdmin();

  console.log("🏁 All developer essentials seeded successfully.");
};

/**
 * Standalone entry point — initializes models, seeds, then exits.
 * Usage: node src/seeder/seedDeveloperEssentials.js
 */
const seedDeveloperEssentials = async () => {
  try {
    // Initialize Sequelize models (only needed when running standalone)
    await initModels();

    await runDeveloperEssentialSeeds();
  } catch (error) {
    console.error("❌ Seeding process failed:", error);
  } finally {
    // Close connection properly
    if (db.sequelize) {
      await db.sequelize.close();
    }
    process.exit(0);
  }
};

// Only run standalone when invoked directly
if (process.argv[1] && (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}` || import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/")))) {
  seedDeveloperEssentials();
}
