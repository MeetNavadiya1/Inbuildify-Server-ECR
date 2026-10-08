import db from "../config/database/models/postgre-models/index.js";
import { DRIVE_FILE_MAPPING } from "../constants/driveFile.js";
import { generatePresignedDownloadUrl } from "../service/s3.service.js";
import { buildDriveFileName, ensureUniqueDriveFileName } from "../service/fileNaming.service.js";
import { findOrCreateDriveFolder } from "./driveFolder.helper.js";
import { runAsSampleDataSideEffect } from "../config/database/models/postgre-models/sampleDataFlag.js";

const REFERENCE_TYPE = DRIVE_FILE_MAPPING.REFERENCE_NAMES.QUOTATION_VERSION;

// QuotationVersion columns that hold a DriveFile primary key (UUID FK), keyed
// by the sub_reference_type they track. The actual file (s3_key/URL) lives only
// in drive_files; these columns are a direct pointer to the current file row.
// Kept in sync centrally here so every upload path stays consistent.
const VERSION_COLUMN_BY_SUB_REFERENCE = {
  [DRIVE_FILE_MAPPING.SUB_REFERENCES.STRUCTURE_ENGINEER_REPORT]: "structure_engineer_report",
  [DRIVE_FILE_MAPPING.SUB_REFERENCES.ENGINEERING_REQUIREMENT]: "quotation_version_detail",
};

const FOLDER_BY_SUB_REFERENCE = {
  [DRIVE_FILE_MAPPING.SUB_REFERENCES.QUOTATION_REPORT]: DRIVE_FILE_MAPPING.FOLDERS.QUOTATION_REPORTS,
  [DRIVE_FILE_MAPPING.SUB_REFERENCES.SIGNED_QUOTATION_REPORT]: DRIVE_FILE_MAPPING.FOLDERS.QUOTATION_REPORTS,
  [DRIVE_FILE_MAPPING.SUB_REFERENCES.STRUCTURE_ENGINEER_REPORT]: DRIVE_FILE_MAPPING.FOLDERS.STRUCTURE_ENGINEER_REPORTS,
  [DRIVE_FILE_MAPPING.SUB_REFERENCES.STRUCTURE_ENGINEER_UPLOAD]: DRIVE_FILE_MAPPING.FOLDERS.STRUCTURE_ENGINEER_REPORTS,
  [DRIVE_FILE_MAPPING.SUB_REFERENCES.ENGINEERING_REQUIREMENT]: DRIVE_FILE_MAPPING.FOLDERS.ENGINEERING_REQUIREMENTS,
};

async function resolveLeadContext(versionId, { companyId, builderId, leadId, transaction } = {}) {
  if (companyId !== undefined && builderId !== undefined && leadId !== undefined) {
    return { companyId, builderId, leadId };
  }
  const { QuotationVersion, Quotation, Leads } = db.sequelize.models;
  const version = await QuotationVersion.findByPk(versionId, {
    include: [{
      model: Quotation,
      as: "quotation",
      include: [{ model: Leads, as: "lead", attributes: ["leads_id", "builder_id", "company_id"] }],
    }],
    transaction,
    hooks: false,
  });
  const lead = version?.quotation?.lead;
  return {
    companyId: companyId ?? lead?.company_id ?? null,
    builderId: builderId ?? lead?.builder_id ?? null,
    leadId: leadId ?? lead?.leads_id ?? null,
  };
}

/**
 * Upsert a DriveFile linked to a QuotationVersion via the polymorphic
 * (reference_id, reference_type, sub_reference_type) tuple. Replaces direct
 * writes to legacy columns (pdf_url, signed_pdf_url, upload_report,
 * structure_engineer_report, quotation_version_detail).
 *
 * Returns the saved DriveFile instance — the caller stores its `file_id` on
 * the legacy column so existing FK-style reads continue to resolve.
 */
export async function upsertQuotationDriveFile({
  versionId,
  subReferenceType,
  s3Key,
  size,
  originalName,
  fileName,
  fileExtension = "pdf",
  mimeType = "application/pdf",
  companyId,
  builderId,
  leadId,
  uploadedBy = null,
  transaction = null,
}) {
  if (!versionId) throw new Error("upsertQuotationDriveFile: versionId is required");
  if (!subReferenceType) throw new Error("upsertQuotationDriveFile: subReferenceType is required");
  if (!s3Key) throw new Error("upsertQuotationDriveFile: s3Key is required");

  const { DriveFile } = db.sequelize.models;

  const localTransaction = !transaction ? await db.sequelize.transaction() : null;
  const t = transaction || localTransaction;

  try {
    const result = await runAsSampleDataSideEffect(async () => {
      const ctx = await resolveLeadContext(versionId, { companyId, builderId, leadId, transaction: t });

      const folderName = FOLDER_BY_SUB_REFERENCE[subReferenceType];
      const folder = folderName
        ? await findOrCreateDriveFolder({
          name: folderName,
          companyId: ctx.companyId,
          builderId: ctx.builderId,
          createdBy: uploadedBy,
          transaction: t,
        })
        : null;

      const resolvedOriginalName = originalName || s3Key.split("/").pop() || `${subReferenceType}.pdf`;
      // Name from the administrator-configured format (Admin → Integration → File
      // Naming); `file_name` is UNIQUE, so de-duplicate before inserting.
      const resolvedFileName = fileName || await ensureUniqueDriveFileName(
        await buildDriveFileName({
          subReferenceType,
          companyId: ctx.companyId,
          builderId: ctx.builderId,
          leadId: ctx.leadId,
          quotationVersionId: versionId,
          originalName: resolvedOriginalName,
          extension: fileExtension,
          mimeType,
          transaction: t,
        }),
        { transaction: t },
      );

      // Serialize concurrent upserts against the same polymorphic tuple.
      // `SELECT ... FOR UPDATE` cannot lock a row that does not exist yet, so we
      // hold a Postgres transaction-scoped advisory lock keyed by the tuple.
      // The second writer blocks here until the first commits, then takes the
      // UPDATE branch below instead of inserting a duplicate row.
      //
      // The advisory lock only serializes callers that go through this helper.
      // The real guarantee is the partial unique index
      // `drive_files_polymorphic_active_unique` (migration 20260523120000): if a
      // racing writer on another path beats us to the INSERT, the DB rejects our
      // duplicate and we fall back to UPDATE — see the catch below.
      const advisoryKey = `${REFERENCE_TYPE}|${subReferenceType}|${versionId}`;
      await db.sequelize.query(
        "SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))",
        { replacements: { key: advisoryKey }, transaction: t },
      );

      const whereClause = {
        reference_id: versionId,
        reference_type: REFERENCE_TYPE,
        sub_reference_type: subReferenceType,
      };

      const updatePayload = (existing) => ({
        s3_key: s3Key,
        size: size ?? existing?.size ?? null,
        original_name: resolvedOriginalName,
        file_extension: fileExtension,
        mime_type: mimeType,
        folder_id: folder?.drive_id ?? existing?.folder_id ?? null,
        company_id: ctx.companyId ?? existing?.company_id ?? null,
        builder_id: ctx.builderId ?? existing?.builder_id ?? null,
        lead_id: ctx.leadId ?? existing?.lead_id ?? null,
        uploaded_by: uploadedBy ?? existing?.uploaded_by ?? null,
      });

      const existing = await DriveFile.findOne({ where: whereClause, transaction: t });

      let driveFile;
      if (existing) {
        await existing.update(updatePayload(existing), { transaction: t });
        driveFile = existing;
      } else {
        try {
          // Wrap the INSERT in a SAVEPOINT (nested managed transaction). If a
          // concurrent writer already inserted the active row, the partial unique
          // index raises a violation; Sequelize rolls back to the savepoint,
          // leaving the outer transaction `t` usable so we can switch to UPDATE.
          driveFile = await db.sequelize.transaction({ transaction: t }, (sp) =>
            DriveFile.create(
              {
                ...whereClause,
                folder_id: folder?.drive_id ?? null,
                company_id: ctx.companyId,
                builder_id: ctx.builderId,
                lead_id: ctx.leadId,
                uploaded_by: uploadedBy,
                original_name: resolvedOriginalName,
                file_name: resolvedFileName,
                s3_key: s3Key,
                file_extension: fileExtension,
                mime_type: mimeType,
                size: size ?? null,
              },
              { transaction: sp },
            ),
          );
        } catch (error) {
          if (error?.name !== "SequelizeUniqueConstraintError") {
            throw error;
          }
          // Lost the race — the active row now exists. Re-read and update it.
          const winner = await DriveFile.findOne({ where: whereClause, transaction: t });
          if (!winner) {
            throw error;
          }
          await winner.update(updatePayload(winner), { transaction: t });
          driveFile = winner;
        }
      }

      // Point the matching QuotationVersion column at the DriveFile PK. This is a
      // bulk update (Model.update), so the per-instance afterUpdate clone hook
      // does not fire. The s3_key/URL is never written here — it stays in
      // drive_files only.
      const versionColumn = VERSION_COLUMN_BY_SUB_REFERENCE[subReferenceType];
      if (versionColumn && driveFile?.file_id) {
        const { QuotationVersion } = db.sequelize.models;
        await QuotationVersion.update(
          { [versionColumn]: driveFile.file_id },
          { where: { quotation_version_id: versionId }, transaction: t },
        );
      }

      return driveFile;
    });

    if (localTransaction) {
      await localTransaction.commit();
    }
    return result;
  } catch (error) {
    if (localTransaction) {
      await localTransaction.rollback();
    }
    throw error;
  }
}

export async function getQuotationDriveFile(versionId, subReferenceType, { transaction } = {}) {
  const { DriveFile } = db.sequelize.models;
  return DriveFile.findOne({
    where: {
      reference_id: versionId,
      reference_type: REFERENCE_TYPE,
      sub_reference_type: subReferenceType,
    },
    transaction,
  });
}

export async function getQuotationDriveFileS3Key(versionId, subReferenceType, { transaction } = {}) {
  const file = await getQuotationDriveFile(versionId, subReferenceType, { transaction });
  return file?.s3_key || null;
}

export async function getQuotationDriveFilePresignedUrl(versionId, subReferenceType, { expiresIn = 3600, transaction } = {}) {
  const s3Key = await getQuotationDriveFileS3Key(versionId, subReferenceType, { transaction });
  if (!s3Key) {
    return null;
  }
  const result = await generatePresignedDownloadUrl(s3Key, expiresIn);
  return result.success ? result.url : null;
}

export async function deleteQuotationDriveFile(versionId, subReferenceType, { transaction } = {}) {
  const { DriveFile } = db.sequelize.models;
  return DriveFile.destroy({
    where: {
      reference_id: versionId,
      reference_type: REFERENCE_TYPE,
      sub_reference_type: subReferenceType,
    },
    transaction,
  });
}

export const QUOTATION_SUB_REFERENCES = DRIVE_FILE_MAPPING.SUB_REFERENCES;
