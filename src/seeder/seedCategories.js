
import db, { initModels } from "../config/database/models/postgre-models/index.js";

const seedCategories = async () => {
  try {
    console.log("🌱 Starting categories seeding...");

    // Initialize Sequelize models
    await initModels();
    const { AdminCategory } = db;

    const adminCategories = [
      {
        name: "base price",
        description: "base pricing for standard home package",
      },
      {
        name: "site costs",
        description: "site preparation and foundation-related costs",
      },
      {
        name: "kitchen",
        description: "kitchen fixtures, fittings, and customization",
      },
      {
        name: "electrical",
        description: "wiring, lighting, and additional electrical requirements",
      },
      {
        name: "pre construction",
        description: "pre-construction fees and mandatory works",
      },
      {
        name: "retaining wall",
        description: "costs related to retaining walls",
      },
      {
        name: "council requirements",
        description: "council-related fees and compliance requirements",
      },
      {
        name: "external structure",
        description: "costs for external structure and add-ons",
      },
    ];

    for (const adminCategory of adminCategories) {
      const [record, created] = await AdminCategory.findOrCreate({
        where: { name: adminCategory.name },
        defaults: adminCategory,
      });

      if (created) {
        console.log(`✅ Created admin category: ${adminCategory.name}`);
      } else {
        console.log(`ℹ️ Admin category already exists: ${adminCategory.name}`);
      }
    }

    console.log("✅ Categories seeding completed.");
  } catch (error) {
    console.error("❌ Seeding failed:", error);
  } finally {
    if (db.sequelize) {
      await db.sequelize.close();
    }
    process.exit(0);
  }
};

seedCategories();
