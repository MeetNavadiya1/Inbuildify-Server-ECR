import db from "../config/database/models/postgre-models/index.js";
import { DRIVE_FILE_MAPPING } from "../constants/driveFile.js";
import { generatePresignedDownloadUrl } from "../service/s3.service.js";
import { buildDriveFileName, ensureUniqueDriveFileName } from "../service/fileNaming.service.js";
import { findOrCreateDriveFolder } from "./driveFolder.helper.js";

// Job-scoped DriveFiles are tracked by the polymorphic tuple
// (reference_id = job_id, reference_type = Job, sub_reference_type = <sub>) and
// mirrored onto a direct FK column on the job. Mirrors quotationDriveFile.helper.
const REFERENCE_TYPE = DRIVE_FILE_MAPPING.REFERENCE_NAMES.JOB;

// Per-sub-reference config: which job column points at the file, and which drive
// folder it lives under.
const SUB_CONFIG = {
  [DRIVE_FILE_MAPPING.SUB_REFERENCES.COLOR_SELECTION_REPORT]: {
    jobColumn: "color_report",
    folder: DRIVE_FILE_MAPPING.FOLDERS.COLOR_SELECTION_REPORTS,
  },
  [DRIVE_FILE_MAPPING.SUB_REFERENCES.COLOR_SCHEDULE_DOCUMENT]: {
    jobColumn: "color_document",
    folder: DRIVE_FILE_MAPPING.FOLDERS.COLOR_SCHEDULE_DOCUMENTS,
  },
};

async function resolveJobContext(jobId, { companyId, builderId, leadId, transaction } = {}) {
  if (companyId !== undefined && builderId !== undefined && leadId !== undefined) {
    return { companyId, builderId, leadId };
  }
  const { Job, Opportunity, Leads } = db.sequelize.models;
  const job = await Job.findByPk(jobId, {
    attributes: ["job_id", "company_id", "builder_id"],
    include: [
      {
        model: Opportunity,
        as: "opportunity",
        attributes: ["opportunity_id"],
        required: false,
        include: [{ model: Leads, as: "lead", attributes: ["leads_id"], required: false }],
      },
    ],
    transaction,
    hooks: false,
  });
  const lead = job?.opportunity?.lead;
  return {
    companyId: companyId ?? job?.company_id ?? null,
    builderId: builderId ?? job?.builder_id ?? null,
    leadId: leadId ?? lead?.leads_id ?? null,
  };
}

/**
 * Upsert the DriveFile for a job + sub-reference tuple, and point the matching
 * job column at it. Re-generating a PDF overwrites the existing active row
 * (partial unique index), so the stored file stays a single, in-place-updated
 * file per job. Returns the saved DriveFile instance.
 */
async function upsertJobDriveFile({
  jobId,
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
  if (!jobId) throw new Error("upsertJobDriveFile: jobId is required");
  if (!s3Key) throw new Error("upsertJobDriveFile: s3Key is required");
  const config = SUB_CONFIG[subReferenceType];
  if (!config) throw new Error(`upsertJobDriveFile: unknown subReferenceType ${subReferenceType}`);

  const { DriveFile, Job } = db.sequelize.models;

  const localTransaction = !transaction ? await db.sequelize.transaction() : null;
  const t = transaction || localTransaction;

  try {
    const ctx = await resolveJobContext(jobId, { companyId, builderId, leadId, transaction: t });

    const folder = await findOrCreateDriveFolder({
      name: config.folder,
      companyId: ctx.companyId,
      builderId: ctx.builderId,
      createdBy: uploadedBy,
      transaction: t,
    });

    const resolvedOriginalName = originalName || s3Key.split("/").pop() || `${subReferenceType}.pdf`;
    // Name from the administrator-configured format (Admin → Integration → File
    // Naming); `file_name` is UNIQUE, so de-duplicate before inserting.
    const resolvedFileName = fileName || await ensureUniqueDriveFileName(
      await buildDriveFileName({
        subReferenceType,
        companyId: ctx.companyId,
        builderId: ctx.builderId,
        leadId: ctx.leadId,
        jobId,
        originalName: resolvedOriginalName,
        extension: fileExtension,
        mimeType,
        transaction: t,
      }),
      { transaction: t },
    );

    // Serialize concurrent upserts against the same tuple. The partial unique
    // index `drive_files_polymorphic_active_unique` is the real guarantee — the
    // advisory lock just avoids most conflicts; a lost race falls back to UPDATE.
    const advisoryKey = `${REFERENCE_TYPE}|${subReferenceType}|${jobId}`;
    await db.sequelize.query(
      "SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))",
      { replacements: { key: advisoryKey }, transaction: t },
    );

    const whereClause = {
      reference_id: jobId,
      reference_type: REFERENCE_TYPE,
      sub_reference_type: subReferenceType,
    };

    const updatePayload = (existing) => ({
      s3_key: s3Key,
      size: size ?? existing?.size ?? null,
      file_extension: fileExtension,
      mime_type: mimeType,
      folder_id: folder?.drive_id ?? existing?.folder_id ?? null,
      company_id: ctx.companyId ?? existing?.company_id ?? null,
      builder_id: ctx.builderId ?? existing?.builder_id ?? null,
      lead_id: ctx.leadId ?? existing?.lead_id ?? null,
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
        if (error?.name !== "SequelizeUniqueConstraintError") throw error;
        const winner = await DriveFile.findOne({ where: whereClause, transaction: t });
        if (!winner) throw error;
        await winner.update(updatePayload(winner), { transaction: t });
        result = winner;
      }
    }

    if (result?.file_id) {
      await Job.update(
        { [config.jobColumn]: result.file_id },
        { where: { job_id: jobId }, transaction: t },
      );
    }

    if (localTransaction) await localTransaction.commit();
    return result;
  } catch (error) {
    if (localTransaction) await localTransaction.rollback();
    throw error;
  }
}

async function getJobDriveFile(jobId, subReferenceType, { transaction } = {}) {
  const { DriveFile } = db.sequelize.models;
  return DriveFile.findOne({
    where: { reference_id: jobId, reference_type: REFERENCE_TYPE, sub_reference_type: subReferenceType },
    transaction,
  });
}

async function getJobDriveFilePresignedUrl(jobId, subReferenceType, { expiresIn = 3600, transaction } = {}) {
  const file = await getJobDriveFile(jobId, subReferenceType, { transaction });
  if (!file?.s3_key) return null;
  const result = await generatePresignedDownloadUrl(file.s3_key, expiresIn);
  return result.success ? result.url : null;
}

/**
 * Remove a stored job file: soft-delete the DriveFile row and clear the job
 * pointer column (a paranoid destroy does not fire the FK SET NULL).
 */
async function deleteJobDriveFile(jobId, subReferenceType, { transaction = null } = {}) {
  const config = SUB_CONFIG[subReferenceType];
  const { DriveFile, Job } = db.sequelize.models;

  const localTransaction = !transaction ? await db.sequelize.transaction() : null;
  const t = transaction || localTransaction;

  try {
    if (config?.jobColumn) {
      await Job.update({ [config.jobColumn]: null }, { where: { job_id: jobId }, transaction: t });
    }
    const deleted = await DriveFile.destroy({
      where: { reference_id: jobId, reference_type: REFERENCE_TYPE, sub_reference_type: subReferenceType },
      transaction: t,
    });
    if (localTransaction) await localTransaction.commit();
    return deleted;
  } catch (error) {
    if (localTransaction) await localTransaction.rollback();
    throw error;
  }
}

const REPORT = DRIVE_FILE_MAPPING.SUB_REFERENCES.COLOR_SELECTION_REPORT;
const DOCUMENT = DRIVE_FILE_MAPPING.SUB_REFERENCES.COLOR_SCHEDULE_DOCUMENT;

// ── Colour-selection report (job.color_report) ─────────────────────────────
export const upsertJobColorDriveFile = (args) => upsertJobDriveFile({ ...args, subReferenceType: REPORT });
export const getJobColorDriveFile = (jobId, opts) => getJobDriveFile(jobId, REPORT, opts);
export const getJobColorDriveFilePresignedUrl = (jobId, opts) => getJobDriveFilePresignedUrl(jobId, REPORT, opts);
export const deleteJobColorDriveFile = (jobId, opts) => deleteJobDriveFile(jobId, REPORT, opts);

// ── Colour schedule document (job.color_document) ──────────────────────────
export const upsertJobColorDocumentDriveFile = (args) => upsertJobDriveFile({ ...args, subReferenceType: DOCUMENT });
export const getJobColorDocumentDriveFile = (jobId, opts) => getJobDriveFile(jobId, DOCUMENT, opts);
export const getJobColorDocumentPresignedUrl = (jobId, opts) => getJobDriveFilePresignedUrl(jobId, DOCUMENT, opts);
export const deleteJobColorDocumentDriveFile = (jobId, opts) => deleteJobDriveFile(jobId, DOCUMENT, opts);
