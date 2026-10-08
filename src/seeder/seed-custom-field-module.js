import db, { initModels } from "../config/database/models/postgre-models/index.js";

/**
 * Custom Field Module seeding logic.
 */
export const seedCustomFieldModules = async () => {
  try {
    console.log("🌱 Starting custom field module seeding...");

    // Initialize Sequelize models
    await initModels();
    const { CustomFieldModule } = db;

    const modules = [
      "Job",
      "Lead",
      "Clint info",
    ];

    for (const moduleName of modules) {
      const [module, created] = await CustomFieldModule.findOrCreate({
        where: { name: moduleName },
        defaults: {},
      });

      if (created) {
        console.log(`✅ Created custom field module: ${moduleName}`);
      } else {
        console.log(`ℹ️ Custom field module already exists: ${moduleName}`);
      }
    }

    console.log("🏁 Custom field module seeding completed successfully.");
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    throw error;
  }
};

// Check if run directly
if (process.argv[1] && (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}` || import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/")))) {
  seedCustomFieldModules()
    .catch((err) => console.error(err))
    .finally(async () => {
      if (db.sequelize) {
        await db.sequelize.close();
      }
      process.exit(0);
    });
}

export default { seedCustomFieldModules };
