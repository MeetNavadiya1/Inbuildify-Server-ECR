import db from "../config/database/models/postgre-models/index.js";

/**
 * Seed default portal_settings for a new builder
 */
export async function seedPortalSettings({ company_id, builder_id, created_by, transaction }) {
  const { PortalSettings } = db;

  await PortalSettings.findOrCreate({
    where: { company_id, builder_id },
    defaults: {
      company_id,
      builder_id,
      send_login_credentials_to_customer: false,
      portal_active_days_after_handover: 0,
      send_mail_when_portal_inactive: false,
      show_site_supervisor_details: false,
      show_balance_to_pay: false,
      add_notes_enabled: false,
      allow_color_selection: false,
      show_color_cost: false,
      show_construction_stages: false,
      auto_share_site_images: false,
      show_progress_tab: false,
      default_facade_image: null,
      publish_packages_to_agent_portal: false,
      created_by,
      updated_by: created_by,
    },
    transaction,
  });
}

export default { seedPortalSettings };
