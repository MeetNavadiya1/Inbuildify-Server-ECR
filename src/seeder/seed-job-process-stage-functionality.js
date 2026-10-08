import db, { initModels } from "../config/database/models/postgre-models/index.js";

/**
 * Job Process Stage Functionality seeding logic.
 */
export const seedJobProcessStageFunctionalities = async () => {
  try {
    console.log("🌱 Starting job process stage functionality seeding...");

    // Initialize Sequelize models
    await initModels();
    const { JobProcessStageFunctionality } = db;

    const functionalities = [
      { name: "Maintenance", is_workflow: false },
      { name: "Construction", is_workflow: false },
      { name: "Color", is_workflow: false },
      { name: "Preconstruction", is_workflow: false },
      { name: "Sales", is_workflow: false },
      { name: "WorkFlow", is_workflow: true },
      // Workflow-specific categories — behave exactly like WorkFlow (is_workflow: true),
      // only the category differs. Each keeps its own per-job status via its own stage_id.
      { name: "Pre-Construction Workflow", is_workflow: true },
      { name: "Construction Workflow", is_workflow: true },
      { name: "Post-Construction Workflow", is_workflow: true },
    ];

    for (const data of functionalities) {
      const [type, created] = await JobProcessStageFunctionality.findOrCreate({
        where: { name: data.name },
        defaults: {
          is_workflow: data.is_workflow,
        },
      });

      if (created) {
        console.log(`✅ Created functionality: ${data.name}`);
      } else {
        // Update if already exists to ensure is_workflow matches the seed requirements
        await type.update({ is_workflow: data.is_workflow });
        console.log(`ℹ️ Functionality updated/verified: ${data.name}`);
      }
    }

    console.log("🏁 Job process stage functionality seeding completed successfully.");
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    throw error;
  }
};

// Check if run directly
if (process.argv[1] && (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}` || import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/")))) {
  seedJobProcessStageFunctionalities()
    .catch((err) => console.error(err))
    .finally(async () => {
      if (db.sequelize) {
        await db.sequelize.close();
      }
      process.exit(0);
    });
}

export default { seedJobProcessStageFunctionalities };
