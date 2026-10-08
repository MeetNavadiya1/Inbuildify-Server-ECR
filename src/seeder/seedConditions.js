import db, { initModels } from "../config/database/models/postgre-models/index.js";

const seedConditions = async () => {
  try {
    console.log("🌱 Starting conditions seeding...");

    // Initialize Sequelize models
    await initModels();
    const { Conditions } = db;

    // Static conditions to seed
    const conditions = [
      {
        name: "SQFT_LIMIT",
        description: "Restriction based on total square footage range",
      },
      {
        name: "WIDTH_LIMIT",
        description: "Restriction based on building width",
      },
      {
        name: "HEIGHT_LIMIT",
        description: "Restriction based on building height",
      },
      {
        name: "FLOOR_LIMIT",
        description: "Restriction based on number of floors",
      },
      {
        name: "CUSTOM_RULE",
        description: "Custom rule defined by the builder",
      },
    ];

    // Insert each condition if not already present
    for (const condition of conditions) {
      const [record, created] = await Conditions.findOrCreate({
        where: { name: condition.name },
        defaults: condition,
      });

      if (created) {
        console.log(`✅ Created condition: ${condition.name}`);
      } else {
        console.log(`ℹ️ Condition already exists: ${condition.name}`);
      }
    }

    console.log("✅ Conditions seeding completed.");
  } catch (error) {
    console.error("❌ Seeding failed:", error);
  } finally {
    if (db.sequelize) {
      await db.sequelize.close();
    }
    process.exit(0);
  }
};

seedConditions();
