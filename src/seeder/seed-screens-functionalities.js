import db, { initModels } from "../config/database/models/postgre-models/index.js";

/**
 * Screen and Functionality seeding logic.
 */
export const seedScreensAndFunctionalities = async () => {
  try {
    console.log("🌱 Starting screen and functionality seeding...");

    // Initialize Sequelize models
    await initModels();
    const { Screen, Functionality } = db;

    const screenData = [
      { name: "Dashboard", functionalities: ["View Analytics", "Recent Activity"] },
      { name: "Leads", functionalities: ["Create Lead", "Edit Lead", "Delete Lead", "Import Leads"] },
      { name: "Jobs", functionalities: ["View Jobs", "Update Job Status", "Assign Supervisor"] },
      { name: "Contacts", functionalities: ["Manage Contacts", "Associate with Lead"] },
      { name: "Quotations", functionalities: ["Create Quotation", "Approve Quotation", "Send to Client"] },
      { name: "Invoices", functionalities: ["Generate Invoice", "Record Payment", "View Overdue"] },
      { name: "Settings", functionalities: ["General Settings", "Sales Module Settings", "Email Templates"] },
      { name: "Users", functionalities: ["Create User", "Deactivate User", "Manage Roles"] },
      { name: "Reports", functionalities: ["Sales Report", "Construction Report", "Financial Report"] },
      { name: "Inventory", functionalities: ["Manage Categories", "Manage Items", "Stock Update"] },
    ];

    for (const data of screenData) {
      // 1. Find or Create Screen
      const [screen, screenCreated] = await Screen.findOrCreate({
        where: { name: data.name },
        defaults: { name: data.name },
      });

      if (screenCreated) {
        console.log(`✅ Created Screen: ${data.name}`);
      } else {
        console.log(`ℹ️ Screen already exists: ${data.name}`);
      }

      // 2. Find or Create Functionalities for this Screen
      for (const funcName of data.functionalities) {
        const [functionality, funcCreated] = await Functionality.findOrCreate({
          where: { name: funcName, screen_id: screen.screen_id },
          defaults: { name: funcName, screen_id: screen.screen_id },
        });

        if (funcCreated) {
          console.log(`   ✅ Created Functionality: ${funcName}`);
        } else {
          console.log(`   ℹ️ Functionality already exists: ${funcName}`);
        }
      }
    }

    console.log("✅ Screen and functionality seeding completed.");
  } catch (error) {
    console.error("❌ Screen and functionality seeding failed:", error);
    throw error;
  }
};

// Check if run directly
if (process.argv[1] && (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}` || import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/")) || process.argv[1].endsWith("seed-screens-functionalities.js"))) {
  seedScreensAndFunctionalities()
    .catch((err) => console.error(err))
    .finally(async () => {
      if (db.sequelize) {
        await db.sequelize.close();
      }
      process.exit(0);
    });
}

export default seedScreensAndFunctionalities;
