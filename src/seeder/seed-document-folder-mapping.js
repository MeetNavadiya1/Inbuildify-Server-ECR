import db from "../config/database/models/postgre-models/index.js";

/**
 * Seed default document_folder_mapping for a new builder
 */
export async function seedDocumentFolderMapping({ company_id, builder_id, created_by, transaction }) {
  const { DocumentFolderMapping } = db;

  await DocumentFolderMapping.findOrCreate({
    where: { company_id, builder_id },
    defaults: {
      company_id,
      builder_id,
      signed_quotation: null,
      signed_color: null,
      signed_variation: null,
      signed_maintenance: null,
      signed_contract_document: null,
      compliance_certificate: null,
      purchase_order: null,
      job_documents: null,
      select_all_files_from_folder: false,
      created_by,
      updated_by: created_by,
    },
    transaction,
  });
}

export default { seedDocumentFolderMapping };
