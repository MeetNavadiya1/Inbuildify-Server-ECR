import db from "../config/database/models/postgre-models/index.js";

/**
 * Seed default integration_settings for a new builder
 */
export async function seedIntegrationSettings({ company_id, builder_id, created_by, transaction }) {
  const { IntegrationSettings } = db;

  await IntegrationSettings.findOrCreate({
    where: { company_id, builder_id },
    defaults: {
      company_id,
      builder_id,
      automatically_send_welcome_email: false,
      rea_hl_enabled: false,
      canibuild_enabled: false,
      website_hl_enabled: false,
      google_enabled: false,
      assign_leads_if_assignee_not_found: null,
      always_assign_leads_to: null,
      created_by,
      updated_by: created_by,
    },
    transaction,
  });
}

export default { seedIntegrationSettings };
