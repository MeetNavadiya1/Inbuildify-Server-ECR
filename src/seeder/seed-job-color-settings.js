import db from "../config/database/models/postgre-models/index.js";

/**
 * Seed default job_color_settings for a new builder
 */
export async function seedJobColorSettings({ company_id, builder_id, created_by, transaction }) {
  const { JobColorSettings } = db;

  await JobColorSettings.findOrCreate({
    where: { company_id, builder_id },
    defaults: {
      company_id,
      builder_id,
      hide_color_item_images: false,
      hide_color_item_price: false,
      exit_color_code: false,
      page_orientation_portrait: true,
      header_text: null,
      created_by,
      updated_by: created_by,
    },
    transaction,
  });
}

export default { seedJobColorSettings };
