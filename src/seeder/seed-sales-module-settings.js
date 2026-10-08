import db from "../config/database/models/postgre-models/index.js";

/**
 * Seed default sales_module_settings for a new builder
 */
export async function seedSalesModuleSettings({ company_id, builder_id, created_by, transaction }) {
  const { SalesModuleSettings } = db;

  await SalesModuleSettings.findOrCreate({
    where: { company_id, builder_id },
    defaults: {
      company_id,
      builder_id,
      allow_duplicate_leads: false,
      send_email_on_new_lead: true,
      show_common_folders: true,
      lead_mandatory_option: "email_and_phone",
      role_id: [],
      sales_won_button_text: "Mark as Won",
      house_size_unit: "sq_m2",
      created_by,
      updated_by: created_by,
    },
    transaction,
  });
}

export default { seedSalesModuleSettings };
