import db from "../config/database/models/postgre-models/index.js";
import { DRIVE_FILE_MAPPING } from "../constants/driveFile.js";
import { generatePresignedDownloadUrl } from "../service/s3.service.js";
import { buildDriveFileName, ensureUniqueDriveFileName } from "../service/fileNaming.service.js";
import { findOrCreateDriveFolder } from "./driveFolder.helper.js";

const REFERENCE_TYPE = DRIVE_FILE_MAPPING.REFERENCE_NAMES.BUILDING_CONTRACT;
const SUB_REFERENCE_TYPE = DRIVE_FILE_MAPPING.SUB_REFERENCES.BUILDING_CONTRACT_PDF;
const FOLDER_NAME = DRIVE_FILE_MAPPING.FOLDERS.BUILDING_CONTRACTS;

/**
 * Upsert a DriveFile for a Building Contract PDF.
 * Uses the polymorphic tuple (reference_id=contractId, reference_type='BuildingContract', sub_reference_type='BuildingContractPdf').
 * Returns the saved DriveFile instance whose file_id is stored on building_contracts.pdf_file_id.
 */
export async function upsertBuildingContractDriveFile({
  contractId,
  s3Key,
  size,
  originalName,
  fileName,
  companyId,
  builderId,
  uploadedBy = null,
  transaction = null,
}) {
  if (!contractId) throw new Error("upsertBuildingContractDriveFile: contractId is required");
  if (!s3Key) throw new Error("upsertBuildingContractDriveFile: s3Key is required");

  const { DriveFile } = db.sequelize.models;

  const localTransaction = !transaction ? await db.sequelize.transaction() : null;
  const t = transaction || localTransaction;

  try {
    const folder = await findOrCreateDriveFolder({
      name: FOLDER_NAME,
      companyId,
      builderId,
      createdBy: uploadedBy,
      transaction: t,
    });

    const resolvedOriginalName = originalName || `building-contract-${contractId}.pdf`;
    // Name from the administrator-configured format (Admin → Integration → File
    // Naming); `file_name` is UNIQUE, so de-duplicate before inserting.
    const resolvedFileName = fileName || await ensureUniqueDriveFileName(
      await buildDriveFileName({
        subReferenceType: SUB_REFERENCE_TYPE,
        companyId,
        builderId,
        originalName: resolvedOriginalName,
        transaction: t,
      }),
      { transaction: t },
    );

    const advisoryKey = `${REFERENCE_TYPE}|${SUB_REFERENCE_TYPE}|${contractId}`;
    await db.sequelize.query(
      "SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))",
      { replacements: { key: advisoryKey }, transaction: t },
    );

    const whereClause = {
      reference_id: contractId,
      reference_type: REFERENCE_TYPE,
      sub_reference_type: SUB_REFERENCE_TYPE,
    };

    const updatePayload = (existing) => ({
      s3_key: s3Key,
      size: size ?? existing?.size ?? null,
      file_extension: "pdf",
      mime_type: "application/pdf",
      folder_id: folder?.drive_id ?? existing?.folder_id ?? null,
      company_id: companyId ?? existing?.company_id ?? null,
      builder_id: builderId ?? existing?.builder_id ?? null,
      uploaded_by: uploadedBy ?? existing?.uploaded_by ?? null,
    });

    const existing = await DriveFile.findOne({ where: whereClause, transaction: t });

    let result;
    if (existing) {
      await existing.update(updatePayload(existing), { transaction: t });
      result = existing;
    } else {
      try {
        result = await db.sequelize.transaction({ transaction: t }, (sp) =>
          DriveFile.create(
            {
              ...whereClause,
              folder_id: folder?.drive_id ?? null,
              company_id: companyId,
              builder_id: builderId,
              uploaded_by: uploadedBy,
              original_name: resolvedOriginalName,
              file_name: resolvedFileName,
              s3_key: s3Key,
              file_extension: "pdf",
              mime_type: "application/pdf",
              size: size ?? null,
            },
            { transaction: sp },
          ),
        );
      } catch (error) {
        if (error?.name !== "SequelizeUniqueConstraintError") throw error;
        const winner = await DriveFile.findOne({ where: whereClause, transaction: t });
        if (!winner) throw error;
        await winner.update(updatePayload(winner), { transaction: t });
        result = winner;
      }
    }

    // Keep pdf_file_id on the building_contracts row in sync
    if (result?.file_id) {
      const { BuildingContract } = db.sequelize.models;
      await BuildingContract.update(
        { pdf_file_id: result.file_id },
        { where: { building_contract_id: contractId }, transaction: t },
      );
    }

    if (localTransaction) await localTransaction.commit();
    return result;
  } catch (error) {
    if (localTransaction) await localTransaction.rollback();
    throw error;
  }
}

export async function getBuildingContractDriveFile(contractId, { transaction } = {}) {
  const { DriveFile } = db.sequelize.models;
  return DriveFile.findOne({
    where: {
      reference_id: contractId,
      reference_type: REFERENCE_TYPE,
      sub_reference_type: SUB_REFERENCE_TYPE,
    },
    transaction,
  });
}

export async function getBuildingContractPresignedUrl(contractId, { expiresIn = 3600, transaction } = {}) {
  const file = await getBuildingContractDriveFile(contractId, { transaction });
  if (!file?.s3_key) return null;
  const result = await generatePresignedDownloadUrl(file.s3_key, expiresIn);
  return result.success ? result.url : null;
}
