import db from "../config/database/models/postgre-models/index.js";

/**
 * Seed default general_settings for a new builder
 */
export async function seedGeneralSettings({
  company_id,
  builder_id,
  created_by,
  transaction,
}) {
  const { GeneralSettings } = db;

  await GeneralSettings.findOrCreate({
    where: { company_id, builder_id },
    defaults: {
      company_id,
      builder_id,
      notification_referral_partner: false,
      pdf_password_protected: false,
      pdf_password: null,
      round_of_cost: false,
      negative_value_show: true,
      negative_value_color: "#F00000",
      show_reference_id_in_pdf: "hide_document_id_and_job_id",
      job_id_label: null,
    },
    transaction,
  });
}

export default { seedGeneralSettings };
