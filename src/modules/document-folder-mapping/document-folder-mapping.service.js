import { Op } from "sequelize";
import { keysToCamelCase } from "../../utils/common.js";
import db from "../../config/database/models/postgre-models/index.js";

// ─── Shared Helpers ───────────────────────────────────────────────────────────

/** Scope condition: match either builder_id or company_id */
const builderOrCompany = (builderId, companyId) => ({
  [Op.or]: [
    ...(builderId ? [{ builder_id: builderId }] : []),
    ...(companyId ? [{ company_id: companyId }] : []),
  ],
});

/**
 * The folder-typed fields on DocumentFolderMapping.
 * Each value is a UUID referencing a DocumentCommonFolder row.
 */
const FOLDER_FIELDS = [
  "signed_quotation",
  "signed_color",
  "signed_variation",
  "signed_maintenance",
  "signed_contract_document",
  "compliance_certificate",
  "purchase_order",
  "job_documents",
];

/**
 * Validates that every provided folder-field UUID exists in document_common_folder.
 * Returns an error message string on the first invalid field, or null if all valid.
 */
async function validateFolderFieldIds(fields, transaction) {
  const { DocumentCommonFolder, DocumentCommonSubfolder } = db;

  for (const { name, value } of fields) {
    if (value === undefined || value === null) {
      continue;
    }

    const found = await DocumentCommonFolder.findOne({
      where: { document_common_folder_id: value },
      attributes: ["document_common_folder_id"],
      transaction,
    });

    if (!found) {
      const foundSubfolder = await DocumentCommonSubfolder.findOne({
        where: { document_common_subfolder_id: value },
        attributes: ["document_common_subfolder_id"],
        transaction,
      });

      if (!foundSubfolder) {
        return `Invalid ${name} folder ID.`;
      }
    }
  }

  return null;
}

/**
 * Formats a DocumentFolderMapping record into the API response shape.
 */
function formatMappingResponse(record) {
  const plain = record.get ? record.get({ plain: true }) : record;
  return keysToCamelCase(plain);
}

// ─── SERVICE: GET ALL DOCUMENT FOLDER MAPPINGS ───────────────────────────────

/**
 * Fetches the DocumentFolderMapping for the current builder/company.
 * Auto-creates a default row (select_all_files_from_folder = false) if none exists.
 *
 * @returns {{ data: object }}
 */
export async function getAllDocumentFolderMappingsService({
  builderId,
  companyId,
  userId,
}) {
  const { DocumentFolderMapping, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    let record = await DocumentFolderMapping.findOne({
      where: builderOrCompany(builderId, companyId),
      transaction,
    });

    if (!record) {
      record = await DocumentFolderMapping.create(
        {
          company_id: companyId,
          builder_id: builderId,
          select_all_files_from_folder: false,
          created_by: userId,
          updated_by: userId,
        },
        { transaction },
      );
    }

    await transaction.commit();

    return { data: formatMappingResponse(record) };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

// ─── SERVICE: UPDATE DOCUMENT FOLDER MAPPING ─────────────────────────────────

/**
 * Updates the DocumentFolderMapping for the current builder/company.
 * Validates each folder-field UUID, then applies a partial update.
 *
 * @returns {{ data: object }|{ error: { status: number, message: string } }}
 */
export async function updateDocumentFolderMappingService({
  builderId,
  companyId,
  userId,
  signed_quotation,
  signed_color,
  signed_variation,
  signed_maintenance,
  signed_contract_document,
  compliance_certificate,
  purchase_order,
  job_documents,
  select_all_files_from_folder,
}) {
  const { DocumentFolderMapping, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    // ── Find the record ────────────────────────────────────────────────────
    const record = await DocumentFolderMapping.findOne({
      where: builderOrCompany(builderId, companyId),
      order: [["createdAt", "DESC"]],
      transaction,
    });

    if (!record) {
      await transaction.rollback();
      return { error: { status: 404, message: "Failed to update document folder mapping." } };
    }

    // ── Guard: at least one field required ─────────────────────────────────
    const bodyFields = {
      signed_quotation,
      signed_color,
      signed_variation,
      signed_maintenance,
      signed_contract_document,
      compliance_certificate,
      purchase_order,
      job_documents,
      select_all_files_from_folder,
    };

    const hasAnyField = Object.values(bodyFields).some((v) => v !== undefined);
    if (!hasAnyField) {
      await transaction.rollback();
      return { error: { status: 400, message: "No fields provided to update." } };
    }

    // ── Validate folder-field UUIDs ────────────────────────────────────────
    const folderFieldsToValidate = FOLDER_FIELDS.map((name) => ({
      name,
      value: bodyFields[name],
    }));

    const folderError = await validateFolderFieldIds(folderFieldsToValidate, transaction);
    if (folderError) {
      await transaction.rollback();
      return { error: { status: 400, message: folderError } };
    }

    // ── Build update payload (only provided fields) ────────────────────────
    const updatePayload = {
      ...(signed_quotation !== undefined && { signed_quotation }),
      ...(signed_color !== undefined && { signed_color }),
      ...(signed_variation !== undefined && { signed_variation }),
      ...(signed_maintenance !== undefined && { signed_maintenance }),
      ...(signed_contract_document !== undefined && { signed_contract_document }),
      ...(compliance_certificate !== undefined && { compliance_certificate }),
      ...(purchase_order !== undefined && { purchase_order }),
      ...(job_documents !== undefined && { job_documents }),
      ...(select_all_files_from_folder !== undefined && { select_all_files_from_folder }),
      updated_by: userId,
    };

    await record.update(updatePayload, { transaction });

    await transaction.commit();

    return { data: formatMappingResponse(record) };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
