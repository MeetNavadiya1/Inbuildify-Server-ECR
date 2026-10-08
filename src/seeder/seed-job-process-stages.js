import { pathToFileURL } from "url";
import db, { initModels } from "../config/database/models/postgre-models/index.js";

/**
 * Seed default job process stages for a new builder.
 *
 * Stages seeded (in sort order):
 *  1. Sales           → functionality: Sales
 *  2. Preconstruction → functionality: Pre-Construction Workflow
 *  3. Colour          → functionality: Color
 *  4. Construction    → functionality: Construction Workflow
 *  5. Postconstruction → functionality: Post-Construction Workflow
 *  6. Maintenance     → functionality: Maintenance
 *
 * Stages are created with findOrCreate keyed on (company_id, builder_id, name),
 * so any stage that already exists for the builder is left untouched.
 */
export async function seedJobProcessStages({ company_id, builder_id, created_by, transaction }) {
  const { JobProcessStage, JobProcessStageFunctionality } = db;

  // ── 1. Ensure the functionality look-up rows exist (idempotent) ──
  //    These are global (not per-builder) reference rows.
  //    They may not yet exist when seedBuilderDefaults runs for the very first builder.
  const requiredFunctionalities = [
    { name: "Maintenance", is_workflow: false },
    { name: "Construction", is_workflow: false },
    { name: "Color", is_workflow: false },
    { name: "Preconstruction", is_workflow: false },
    { name: "Sales", is_workflow: false },
    { name: "WorkFlow", is_workflow: true },
    { name: "Pre-Construction Workflow", is_workflow: true },
    { name: "Construction Workflow", is_workflow: true },
    { name: "Post-Construction Workflow", is_workflow: true },
  ];

  for (const func of requiredFunctionalities) {
    await JobProcessStageFunctionality.findOrCreate({
      where: { name: func.name },
      defaults: { is_workflow: func.is_workflow },
      transaction,
    });
  }

  // ── 2. Fetch all functionalities and index by name ──
  const allFunctionalities = await JobProcessStageFunctionality.findAll({ transaction });
  const functionalityMap = {};
  for (const f of allFunctionalities) {
    functionalityMap[f.name] = f.functionality_id;
  }

  // ── 3. Seed the six default stages ──
  // Preconstruction / Construction / Postconstruction use the workflow
  // functionalities (is_workflow = true) so each owns its own per-job status.
  const stages = [
    { name: "Sales", functionality: "Sales", sort_order: 1 },
    { name: "Preconstruction", functionality: "Pre-Construction Workflow", sort_order: 2 },
    { name: "Colour", functionality: "Color", sort_order: 3 },
    { name: "Construction", functionality: "Construction Workflow", sort_order: 4 },
    { name: "Postconstruction", functionality: "Post-Construction Workflow", sort_order: 5 },
    { name: "Maintenance", functionality: "Maintenance", sort_order: 6 },
  ];

  for (const stage of stages) {
    const functionality_id = functionalityMap[stage.functionality];
    if (!functionality_id) {
      console.warn(`⚠️ Functionality "${stage.functionality}" not found — skipping stage "${stage.name}".`);
      continue;
    }

    // findOrCreate keyed on (company_id, builder_id, name): if the stage
    // already exists for this builder we leave it exactly as-is (no re-seed).
    await JobProcessStage.findOrCreate({
      where: { company_id, builder_id, name: stage.name },
      defaults: {
        company_id,
        builder_id,
        name: stage.name,
        functionality_id,
        sort_order: stage.sort_order,
      },
      transaction,
    });
  }

  console.log("✅ Job process stages seeded successfully.");
}

// ── Standalone runner ──
// Run directly:  node src/seeder/seed-job-process-stages.js
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  (async () => {
    try {
      await initModels();
      const { Builder } = db;

      // Find all builders and seed stages for each
      const builders = await Builder.findAll();
      if (!builders.length) {
        console.log("ℹ️ No builders found — nothing to seed.");
        return;
      }

      for (const builder of builders) {
        console.log(`🌱 Seeding job process stages for builder: ${builder.builder_id}`);
        await seedJobProcessStages({
          company_id: builder.company_id,
          builder_id: builder.builder_id,
          created_by: null,
          transaction: null,
        });
      }

      console.log("🏁 Job process stages seeding completed for all builders.");
    } catch (error) {
      console.error("❌ Seeding failed:", error);
    } finally {
      if (db.sequelize) {
        await db.sequelize.close();
      }
      process.exit(0);
    }
  })();
}

export default { seedJobProcessStages };
