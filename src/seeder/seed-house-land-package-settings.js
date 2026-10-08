import db from "../config/database/models/postgre-models/index.js";

/**
 * Seed default house_land_package_settings for a new builder
 */
export async function seedHouseLandPackageSettings({ company_id, builder_id, created_by, transaction }) {
  const { HouseLandPackageSettings } = db;

  await HouseLandPackageSettings.findOrCreate({
    where: { company_id, builder_id },
    defaults: {
      company_id,
      builder_id,
      include_facade_cost_in_total: false,
      created_by,
      updated_by: created_by,
    },
    transaction,
  });
}

export default { seedHouseLandPackageSettings };
