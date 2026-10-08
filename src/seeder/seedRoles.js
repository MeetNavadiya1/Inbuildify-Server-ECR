import db, { initModels } from "../config/database/models/postgre-models/index.js";

/**
 * Core role seeding logic.
 */
export const seedRoles = async () => {
  try {
    console.log("🌱 Starting role seeding...");

    // Initialize Sequelize models
    await initModels();
    const { Role } = db;

    const roles = [
      "Builder",
      "Construction Manager",
      "Permits",
      "Company Administrator",
      "MH - Company Admin",
      "My Home - Company Admin",
      "Super Admin",
      "Sales Manager",
      "Construction Manager - MH",
      "Admin Executive",
      "Color Consultant",
      "Sales Manager - MH",
      "Accounts",
      "Agent",
      "Contract Admin",
      "Draft Person",
      "Site Supervisor",
      "Sales Executive",
      "Contact",
      "My Home Admin",
    ];

    for (const roleName of roles) {
      const [role, created] = await Role.findOrCreate({
        where: { name: roleName },
        defaults: {},
      });

      if (created) {
        console.log(`✅ Created role: ${roleName}`);
      } else {
        console.log(`ℹ️ Role already exists: ${roleName}`);
      }
    }

    console.log("🏁 Role seeding completed successfully.");
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    throw error;
  }
};

// Check if run directly
if (process.argv[1] && (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}` || import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/")))) {
  seedRoles()
    .catch((err) => console.error(err))
    .finally(async () => {
      if (db.sequelize) {
        await db.sequelize.close();
      }
      process.exit(0);
    });
}

export default { seedRoles };
