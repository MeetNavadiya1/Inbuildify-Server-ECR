import db, { initModels } from "../config/database/models/postgre-models/index.js";

/**
 * Role Type seeding logic.
 */
export const seedRoleTypes = async () => {
  try {
    console.log("🌱 Starting role type seeding...");

    // Initialize Sequelize models
    await initModels();
    const { Role, RoleType } = db;

    const roleMapping = {
      "Builder": "Builder",
      "Construction Manager": "Construction",
      "Permits": "Permits",
      "Company Administrator": "Administrator",
      "MH - Company Admin": "Administrator",
      "My Home - Company Admin": "Administrator",
      "Super Admin": "Super Admin",
      "Sales Manager": "Sales",
      "Construction Manager - MH": "Construction",
      "Admin Executive": "Administrator",
      "Color Consultant": "Consultant",
      "Sales Manager - MH": "Sales",
      "Accounts": "Accounts",
      "Agent": "Agent",
      "Contract Admin": "Administrator",
      "Draft Person": "Drafting",
      "Site Supervisor": "Supervisor",
      "Sales Executive": "Sales",
      "Contact": "Contact",
      "My Home Admin": "Administrator",
    };

    for (const [roleName, typeName] of Object.entries(roleMapping)) {
      // Find the role first to get its ID
      const role = await Role.findOne({
        where: { name: roleName },
      });

      if (!role) {
        console.warn(`⚠️ Role not found: ${roleName}. Skipping role type creation.`);
        continue;
      }

      const [roleType, created] = await RoleType.findOrCreate({
        where: { role_id: role.role_id, type_name: typeName },
        defaults: {},
      });

      if (created) {
        console.log(`✅ Created role type: ${typeName} for role: ${roleName}`);
      } else {
        console.log(`ℹ️ Role type already exists: ${typeName} for role: ${roleName}`);
      }
    }

    console.log("🏁 Role type seeding completed successfully.");
  } catch (error) {
    console.error("❌ Role type seeding failed:", error);
    throw error;
  }
};

// Check if run directly
if (process.argv[1] && (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}` || import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/")))) {
  seedRoleTypes()
    .catch((err) => console.error(err))
    .finally(async () => {
      if (db.sequelize) {
        await db.sequelize.close();
      }
      process.exit(0);
    });
}

export default { seedRoleTypes };
