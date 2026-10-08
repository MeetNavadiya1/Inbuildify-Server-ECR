"use strict";

/**
 * Migration: Retroactively seed and align default job process stages for existing builders.
 *
 * Ensures all existing builders have exactly the 6 default stages in the correct sort order:
 *  1. Sales           → functionality: Sales
 *  2. Preconstruction → functionality: Pre-Construction Workflow
 *  3. Colour          → functionality: Color
 *  4. Construction    → functionality: Construction Workflow
 *  5. Postconstruction → functionality: Post-Construction Workflow
 *  6. Maintenance     → functionality: Maintenance
 *
 * It updates existing stages if they match by name (case-insensitive) to align their sort order,
 * deletes any duplicates, inserts missing ones, and removes any unmatched deprecated stages.
 */

const REQUIRED_FUNCTIONALITIES = [
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

const DEFAULT_STAGES = [
  { name: "Sales", functionality: "Sales", sort_order: 1 },
  { name: "Preconstruction", functionality: "Pre-Construction Workflow", sort_order: 2 },
  { name: "Colour", functionality: "Color", sort_order: 3 },
  { name: "Construction", functionality: "Construction Workflow", sort_order: 4 },
  { name: "Postconstruction", functionality: "Post-Construction Workflow", sort_order: 5 },
  { name: "Maintenance", functionality: "Maintenance", sort_order: 6 },
];

/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface) {
  const { sequelize } = queryInterface;

  // 1. Ensure required functionalities exist
  for (const func of REQUIRED_FUNCTIONALITIES) {
    await sequelize.query(
      `INSERT INTO job_process_stage_functionality (functionality_id, name, is_workflow)
       SELECT gen_random_uuid(), :name, :is_workflow
       WHERE NOT EXISTS (
         SELECT 1 FROM job_process_stage_functionality WHERE name = :name
       )`,
      {
        replacements: {
          name: func.name,
          is_workflow: func.is_workflow,
        },
      }
    );
  }

  // 2. Fetch all functionalities and map name -> functionality_id
  const [funcRows] = await sequelize.query(
    `SELECT functionality_id, name FROM job_process_stage_functionality`
  );
  const functionalityMap = {};
  for (const f of funcRows) {
    functionalityMap[f.name] = f.functionality_id;
  }

  // 3. Find all builders
  const [builders] = await sequelize.query(
    `SELECT builder_id, company_id FROM builder`
  );

  if (builders.length === 0) {
    console.log("[migration] No builders found. Nothing to seed.");
    return;
  }

  console.log(`[migration] Aligning job process stages for ${builders.length} builder(s)...`);

  for (const builder of builders) {
    const { builder_id, company_id } = builder;

    // Fetch existing stages for this builder
    const [existingStages] = await sequelize.query(
      `SELECT stage_id, name, sort_order, functionality_id 
       FROM job_process_stage 
       WHERE company_id = :company_id AND builder_id = :builder_id`,
      { replacements: { company_id, builder_id } }
    );

    const matchedStageIds = new Set();

    for (const defaultStage of DEFAULT_STAGES) {
      const functionality_id = functionalityMap[defaultStage.functionality];
      if (!functionality_id) {
        console.warn(`[migration] Functionality "${defaultStage.functionality}" not found — skipping stage "${defaultStage.name}".`);
        continue;
      }

      // Find existing stages matching defaultStage.name (case-insensitive)
      const matches = existingStages.filter(
        (es) => es.name.toLowerCase() === defaultStage.name.toLowerCase()
      );

      if (matches.length > 0) {
        // We have at least one match. Update the first one (primary match)
        const primaryMatch = matches[0];
        matchedStageIds.add(primaryMatch.stage_id);

        await sequelize.query(
          `UPDATE job_process_stage
           SET name = :name,
               functionality_id = :functionality_id,
               sort_order = :sort_order,
               updated_at = NOW()
           WHERE stage_id = :stage_id`,
          {
            replacements: {
              name: defaultStage.name,
              functionality_id,
              sort_order: defaultStage.sort_order,
              stage_id: primaryMatch.stage_id,
            },
          }
        );

        // Delete any duplicate matches
        if (matches.length > 1) {
          const duplicateIds = matches.slice(1).map((m) => m.stage_id);
          await sequelize.query(
            `DELETE FROM job_process_stage WHERE stage_id IN (:duplicateIds)`,
            { replacements: { duplicateIds } }
          );
          console.log(`[migration] Deleted ${duplicateIds.length} duplicate stage(s) for builder ${builder_id}`);
        }
      } else {
        // No match found. Insert a new stage
        const [inserted] = await sequelize.query(
          `INSERT INTO job_process_stage (stage_id, company_id, builder_id, name, functionality_id, sort_order, created_at, updated_at)
           VALUES (gen_random_uuid(), :company_id, :builder_id, :name, :functionality_id, :sort_order, NOW(), NOW())
           RETURNING stage_id`,
          {
            replacements: {
              company_id,
              builder_id,
              name: defaultStage.name,
              functionality_id,
              sort_order: defaultStage.sort_order,
            },
          }
        );
        const newStageId = inserted[0].stage_id;
        matchedStageIds.add(newStageId);
      }
    }

    // Finally, delete any stages that were NOT matched by the default stage names
    const unmatchedStages = existingStages.filter((es) => !matchedStageIds.has(es.stage_id));
    if (unmatchedStages.length > 0) {
      const unmatchedIds = unmatchedStages.map((us) => us.stage_id);
      await sequelize.query(
        `DELETE FROM job_process_stage WHERE stage_id IN (:unmatchedIds)`,
        { replacements: { unmatchedIds } }
      );
      console.log(`[migration] Deleted ${unmatchedIds.length} unmatched/deprecated stage(s) for builder ${builder_id}`);
    }
  }

  console.log("[migration] Alignment of job process stages completed successfully.");
}

export async function down(queryInterface) {
  console.log("[migration] down: no-op — cannot safely revert retroactive seeding of default process stages.");
}
