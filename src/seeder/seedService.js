import db, { initModels } from "../config/database/models/postgre-models/index.js";

const seedServices = async () => {
  try {
    console.log("🌱 Starting services seeding...");

    // Initialize Sequelize models
    await initModels();
    const { Service } = db;

    // Static seed data
    const services = [
      { service: "Color Painting" },
      { service: "Furniture Installation" },
      { service: "Plumbing Service" },
      { service: "Electrical Work" },
      { service: "Interior Design" },
    ];

    // Insert data (ignore duplicates by checking existence)
    for (const s of services) {
      const [record, created] = await Service.findOrCreate({
        where: { service: s.service },
        defaults: s,
      });

      if (created) {
        console.log(`✅ Created service: ${s.service}`);
      } else {
        console.log(`ℹ️ Service already exists: ${s.service}`);
      }
    }

    console.log("✅ Services seeding completed.");
  } catch (error) {
    console.error("❌ Service seeding failed:", error);
  } finally {
    if (db.sequelize) {
      await db.sequelize.close();
    }
    process.exit(0);
  }
};

seedServices();
