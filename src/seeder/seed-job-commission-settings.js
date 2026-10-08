import db from "../config/database/models/postgre-models/index.js";

/**
 * Seed default job_commission_settings for a new builder
 */
export async function seedJobCommissionSettings({ company_id, builder_id, created_by, transaction }) {
  const { JobCommissionSettings } = db;

  await JobCommissionSettings.findOrCreate({
    where: { company_id, builder_id },
    defaults: {
      company_id,
      builder_id,
      define_outgoing_commission: false,
      define_incoming_commission: false,
      created_by,
      updated_by: created_by,
    },
    transaction,
  });
}

export default { seedJobCommissionSettings };
