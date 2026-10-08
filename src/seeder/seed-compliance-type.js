import db, { initModels } from "../config/database/models/postgre-models/index.js";

/**
 * Compliance Type seeding logic.
 */
export const seedComplianceTypes = async () => {
  try {
    console.log("🌱 Starting compliance type seeding...");

    // Initialize Sequelize models
    await initModels();
    const { ComplianceType } = db;

    const complianceTypes = [
      "Balcony Balustrade",
      "Ceiling Insulation",
      "Cladding",
      "Drainage",
      "Electrical Non-Prescribed",
      "Electrical Prescribed",
      "Form 12",
      "Form 15",
      "Form 43",
      "Heating & Cooling",
      "Plumbing",
      "Roof Plumbing",
      "Screens",
      "Solar HWS",
      "Stair Balustrade",
      "Staircase Non-Slip",
      "Termite Part A",
      "Termite Part B",
      "Termite Protection",
      "Wall Batts",
      "Waterproofing",
      "Window Glazing",
    ];

    for (const name of complianceTypes) {
      const [type, created] = await ComplianceType.findOrCreate({
        where: { name },
        defaults: {},
      });

      if (created) {
        console.log(`✅ Created compliance type: ${name}`);
      } else {
        console.log(`ℹ️ Compliance type already exists: ${name}`);
      }
    }

    console.log("🏁 Compliance type seeding completed successfully.");
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    throw error;
  }
};

// Check if run directly
if (process.argv[1] && (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}` || import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/")))) {
  seedComplianceTypes()
    .catch((err) => console.error(err))
    .finally(async () => {
      if (db.sequelize) {
        await db.sequelize.close();
      }
      process.exit(0);
    });
}

export default { seedComplianceTypes };
