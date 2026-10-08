import db from "../config/database/models/postgre-models/index.js";

/**
 * Seed default document_file_naming_format for a new builder
 */
export async function seedDocumentFileNamingFormat({ company_id, builder_id, created_by, transaction }) {
  const { DocumentFileNamingFormat } = db;

  await DocumentFileNamingFormat.findOrCreate({
    where: { company_id, builder_id },
    defaults: {
      company_id,
      builder_id,
      naming_format: null,
      created_by,
      updated_by: created_by,
    },
    transaction,
  });
}

export default { seedDocumentFileNamingFormat };
