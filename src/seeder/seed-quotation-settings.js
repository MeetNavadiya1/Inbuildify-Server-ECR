import db from "../config/database/models/postgre-models/index.js";

/**
 * Seed default quotation_settings for a new builder
 */
export async function seedQuotationSettings({ company_id, builder_id, created_by, transaction }) {
  const { QuotationSettings } = db;

  await QuotationSettings.findOrCreate({
    where: { company_id, builder_id },
    defaults: {
      company_id,
      builder_id,
      allow_save_as_new_version: true,
      mandatory_contact_details: true,
      mandatory_dwelling_type: true,
      mandatory_sketch_number: true,
      mandatory_land_title: false,
      enable_dwelling_size: false,
      enable_builder_cost: false,
      allow_notes: true,
      allow_cost_adjustment: true,
      show_notes_by_default: true,
      allow_multiple_packages: false,
      include_additional_items_in_price_adjusted_list: false,
      auto_approve_on_sales_won: false,
      show_default_pricelist_in_additional_items: true,
      hide_price_to_customer: false,
      enable_estimated_price_range: false,
      quotation_validity_days: 30,
      extend_validity_from_updated_date: 0,
      created_by,
      updated_by: created_by,
    },
    transaction,
  });
}

export default { seedQuotationSettings };
