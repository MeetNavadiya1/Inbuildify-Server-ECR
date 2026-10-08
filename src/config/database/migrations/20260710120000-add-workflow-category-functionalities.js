"use strict";

/**
 * Seeds the three workflow-category functionality rows into
 * `job_process_stage_functionality` for already-deployed databases (fresh
 * builder registrations get them via the seeders).
 *
 * These behave exactly like the existing "WorkFlow" functionality
 * (is_workflow = true); only the category differs. Each becomes a distinct
 * stage, so each keeps its own independent per-job status via (job_id, stage_id).
 *
 * The rows are global (not builder-scoped), so a single insert serves every
 * builder. Idempotent: only inserts names that don't already exist.
 */

const WORKFLOW_CATEGORY_FUNCTIONALITIES = [
  "Pre-Construction Workflow",
  "Construction Workflow",
  "Post-Construction Workflow",
];

/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface) {
  // Insert each row only if a functionality with that name doesn't already
  // exist. gen_random_uuid() is evaluated by Postgres for the primary key.
  for (const name of WORKFLOW_CATEGORY_FUNCTIONALITIES) {
    await queryInterface.sequelize.query(
      `INSERT INTO job_process_stage_functionality (functionality_id, name, is_workflow)
       SELECT gen_random_uuid(), :name, true
       WHERE NOT EXISTS (
         SELECT 1 FROM job_process_stage_functionality WHERE name = :name
       )`,
      { replacements: { name } }
    );
  }
}

export async function down(queryInterface) {
  await queryInterface.bulkDelete("job_process_stage_functionality", {
    name: WORKFLOW_CATEGORY_FUNCTIONALITIES,
  });
}
