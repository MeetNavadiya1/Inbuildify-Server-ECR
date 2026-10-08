import db from "../config/database/models/postgre-models/index.js";

/**
 * Seed default job_invoice_settings for a new builder
 */
export async function seedJobInvoiceSettings({ company_id, builder_id, created_by, transaction }) {
  const { JobInvoiceSettings } = db;

  await JobInvoiceSettings.findOrCreate({
    where: { company_id, builder_id },
    defaults: {
      company_id,
      builder_id,
      show_invoice_summary_in_pdf: false,
      invoice_terms_days: 0,
      created_by,
      updated_by: created_by,
    },
    transaction,
  });
}

export default { seedJobInvoiceSettings };
