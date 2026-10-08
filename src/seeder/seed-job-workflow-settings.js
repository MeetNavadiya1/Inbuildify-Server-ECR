import db from "../config/database/models/postgre-models/index.js";

/**
 * Seed default job_workflow_settings for a new builder
 */
export async function seedJobWorkflowSettings({ company_id, builder_id, created_by, transaction }) {
  const { JobWorkflowSettings } = db;

  await JobWorkflowSettings.findOrCreate({
    where: { company_id, builder_id },
    defaults: {
      company_id,
      builder_id,
      show_all_tasks_to_all_roles: false,
      include_weekend_date: false,
      include_holiday_date: false,
      recalculate_estimated_end_dates_future_tasks: false,
      recalculate_estimated_dates_based_on_actual_changes: false,
      created_by,
      updated_by: created_by,
    },
    transaction,
  });
}

export default { seedJobWorkflowSettings };
