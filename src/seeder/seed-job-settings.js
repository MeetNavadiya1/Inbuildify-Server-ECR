import db from "../config/database/models/postgre-models/index.js";

/**
 * Seed default job_settings for a new builder
 */
export async function seedJobSettings({ company_id, builder_id, created_by, transaction }) {
  const { JobSettings } = db;

  await JobSettings.findOrCreate({
    where: { company_id, builder_id },
    defaults: {
      company_id,
      builder_id,
      auto_move_to_maintenance: false,
      auto_mark_completed: false,
      auto_archive_after_completion: false,
      auto_archive_after_days: null,
      milestone_status_check_days: null,
      report_custom_days: null,
      report_status_filter: "all",
      report_include_date: true,
      created_by,
      updated_by: created_by,
    },
    transaction,
  });
}

export default { seedJobSettings };
