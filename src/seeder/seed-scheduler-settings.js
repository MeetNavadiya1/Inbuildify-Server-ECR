import db from "../config/database/models/postgre-models/index.js";

/**
 * Seed default scheduler_settings for a new builder
 */
export async function seedSchedulerSettings({ company_id, builder_id, created_by, transaction }) {
  const { SchedulerSettings } = db;

  await SchedulerSettings.findOrCreate({
    where: { company_id, builder_id },
    defaults: {
      company_id,
      builder_id,
      receiver_of_replies: [],
      created_by,
      updated_by: created_by,
    },
    transaction,
  });
}

export default { seedSchedulerSettings };
