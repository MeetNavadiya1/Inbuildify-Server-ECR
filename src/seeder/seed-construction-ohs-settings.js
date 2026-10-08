import db from "../config/database/models/postgre-models/index.js";

/**
 * Seed default construction_ohs_settings for a new builder
 */
export async function seedConstructionOhsSettings({ company_id, builder_id, created_by, transaction }) {
  const { ConstructionOhsSettings } = db;

  await ConstructionOhsSettings.findOrCreate({
    where: { company_id, builder_id },
    defaults: {
      company_id,
      builder_id,
      signature_required: false,
      minimum_audits: 0,
      created_by,
      updated_by: created_by,
    },
    transaction,
  });
}

export default { seedConstructionOhsSettings };
