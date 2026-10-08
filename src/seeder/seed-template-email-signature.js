import db from "../config/database/models/postgre-models/index.js";

/**
 * Seed default template_email_signature for a new builder
 */
export async function seedTemplateEmailSignature({ company_id, builder_id, created_by, transaction }) {
  const { TemplateEmailSignature } = db;

  await TemplateEmailSignature.findOrCreate({
    where: { company_id, builder_id },
    defaults: {
      company_id,
      builder_id,
      include_email_signature: false,
      signature_content: null,
      created_by,
      updated_by: created_by,
    },
    transaction,
  });
}

export default { seedTemplateEmailSignature };
