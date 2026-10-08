/**
 * S Drive "workspace" — the simplified structure a restricted role (Builder)
 * sees instead of the raw company folder tree.
 *
 * Three lists:
 *   My Leads   — every lead of the caller's builder, with a document count
 *   My Jobs    — every job of the caller's builder, with a document count
 *   documents  — the files hanging off one of those leads / jobs
 *
 * The lead and job lists are the only entry points a Builder gets, and each
 * per-entity fetch re-checks that the entity belongs to them — so passing
 * someone else's leadId returns 404 rather than that lead's paperwork.
 */

import { Op } from "sequelize";
import db from "../../config/database/models/postgre-models/index.js";
import { documentTypeLabelOf } from "../../constants/driveFile.js";
import { collectLeadReferenceIds, collectJobReferenceIds } from "../documents/documents.user-scope.js";
import { buildFileScopeWhere, getSharedEntityIds } from "./drive.scope.js";
import { isPdfEditable, getPdfTypeTag } from "../../utils/pdfEdit.js";
import { isDocumentEditingAllowed } from "../../utils/documentEdit.js";

/** The tenant a restricted caller is bound to. */
const tenantOf = (user) => ({
  ...(user?.builder_id ? { builder_id: user.builder_id } : {}),
  ...(user?.company_id ? { company_id: user.company_id } : {}),
});

const formatFile = (f, editablePdfTypes = [], blockedTypes = []) => ({
  id: f.file_id,
  type: "file",
  name: f.original_name,
  file_extension: f.file_extension,
  mime_type: f.mime_type,
  size: f.size,
  url: f.s3_key,
  is_starred: f.is_starred,
  parent_id: f.folder_id,
  document_type_label: documentTypeLabelOf(f.reference_type, f.sub_reference_type),
  is_editable: isPdfEditable(f, editablePdfTypes, blockedTypes),
  // Whether this document may be edited at all — the administrator's per-file
  // switch, or the rule covering its whole type. Distinct from `is_editable`
  // above, which only says whether a generated PDF offers the record form.
  editing_allowed: isDocumentEditingAllowed(f, blockedTypes),
  pdf_type: getPdfTypeTag(f),
  created_at: f.created_at,
  updated_at: f.updated_at,
  uploaded_by_name: f.uploadedByUser?.name || null,
});

/**
 * Count the caller's documents per lead / job in ONE query rather than one per
 * row, so a builder with hundreds of leads still renders in a single trip.
 * Counts by lead_id / reference_id, which is what every generated PDF carries.
 */
const countByReference = async (referenceIds, leadIds, user) => {
  const { DriveFile } = db.sequelize.models;
  if (!referenceIds.length && !leadIds.length) return new Map();

  const or = [];
  if (referenceIds.length) or.push({ reference_id: { [Op.in]: referenceIds } });
  if (leadIds.length) or.push({ lead_id: { [Op.in]: leadIds } });

  const rows = await DriveFile.findAll({
    where: {
      [Op.and]: [
        { ...(user?.company_id ? { company_id: user.company_id } : {}) },
        { [Op.or]: or },
      ],
    },
    attributes: ["file_id", "reference_id", "lead_id"],
    raw: true,
  });

  const counts = new Map();
  for (const r of rows) {
    for (const key of [r.reference_id, r.lead_id]) {
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return counts;
};

/** My Leads — the caller's builder's leads, each with a document count. */
export const getMyLeadsService = async (user) => {
  const { Leads } = db.sequelize.models;

  const leads = await Leads.findAll({
    where: tenantOf(user),
    attributes: ["leads_id", "name", "reference_number", "created_at", "updated_at"],
    order: [["created_at", "DESC"]],
  });

  const leadIds = leads.map((l) => l.leads_id);
  const counts = await countByReference(leadIds, leadIds, user);

  return {
    items: leads.map((l) => ({
      id: l.leads_id,
      type: "lead",
      name: l.name || l.reference_number || "Untitled lead",
      reference: l.reference_number || null,
      document_count: counts.get(l.leads_id) || 0,
      created_at: l.created_at,
      updated_at: l.updated_at,
    })),
  };
};

/** My Jobs — the caller's builder's jobs, each with a document count. */
export const getMyJobsService = async (user) => {
  const { Job } = db.sequelize.models;

  const jobs = await Job.findAll({
    where: tenantOf(user),
    attributes: ["job_id", "reference_number", "status", "created_at", "updated_at"],
    order: [["created_at", "DESC"]],
  });

  const jobIds = jobs.map((j) => j.job_id);
  const counts = await countByReference(jobIds, [], user);

  return {
    items: jobs.map((j) => ({
      id: j.job_id,
      type: "job",
      name: j.reference_number || "Untitled job",
      reference: j.reference_number || null,
      status: j.status || null,
      document_count: counts.get(j.job_id) || 0,
      created_at: j.created_at,
      updated_at: j.updated_at,
    })),
  };
};

/**
 * Documents for one lead or job.
 *
 * `collectLeadReferenceIds` / `collectJobReferenceIds` resolve the entity in the
 * caller's tenant first and return null when it is not theirs — that null is
 * what turns an id lifted from someone else's URL into a 404. The caller's own
 * file scope is then ANDed on top, so even a legitimately-owned lead only
 * yields files the caller is allowed to see.
 */
export const getEntityDocumentsService = async (entityType, entityId, user) => {
  const { DriveFile } = db.sequelize.models;
  const type = String(entityType || "").toLowerCase();

  const resolved =
    type === "lead"
      ? await collectLeadReferenceIds(entityId, user)
      : type === "job"
        ? await collectJobReferenceIds(entityId, user)
        : null;

  if (!resolved) return null;

  const or = [{ reference_id: { [Op.in]: resolved.referenceIds } }];
  // Lead-scoped views also pick up files that only carry the denormalised
  // lead_id (generated reports), which reference_id alone would miss.
  if (type === "lead") or.push({ lead_id: entityId });

  const fileScope = await buildFileScopeWhere(user);
  const where = {
    [Op.and]: [
      { ...(user?.company_id ? { company_id: user.company_id } : {}) },
      { [Op.or]: or },
      ...(fileScope ? [fileScope] : []),
    ],
  };

  const files = await DriveFile.findAll({
    where: where,
    include: [{ model: db.sequelize.models.Users, as: "uploadedByUser", attributes: ["name"] }],
    order: [["created_at", "DESC"]]
  });

  const settings = await db.GeneralSettings.findOne({
    where: { company_id: user?.company_id }
  });
  const editablePdfTypes = settings?.editable_pdf_types || [];
  const blockedTypes = settings?.non_editable_document_types || [];

  return { entity_type: type, entity_id: entityId, items: files.map(f => formatFile(f, editablePdfTypes, blockedTypes)) };
};

/**
 * Shared Documents — files another user explicitly shared with the caller.
 * Distinct from getSharedWithMeService (which also lists shared folders); this
 * is the flat file list the Builder workspace renders.
 */
export const getSharedDocumentsService = async (user) => {
  const { DriveFile } = db.sequelize.models;
  const sharedFileIds = await getSharedEntityIds(user, "FILE");
  if (!sharedFileIds.length) return { items: [] };

  const files = await DriveFile.findAll({
    where: {
      file_id: { [Op.in]: sharedFileIds },
      ...(user?.company_id ? { company_id: user.company_id } : {}),
    },
    include: [{ model: db.sequelize.models.Users, as: "uploadedByUser", attributes: ["name"] }],
    order: [["created_at", "DESC"]],
  });

  const settings = await db.GeneralSettings.findOne({
    where: { company_id: user?.company_id }
  });
  const editablePdfTypes = settings?.editable_pdf_types || [];
  const blockedTypes = settings?.non_editable_document_types || [];

  return { items: files.map(f => formatFile(f, editablePdfTypes, blockedTypes)) };
};

export default {
  getMyLeadsService,
  getMyJobsService,
  getEntityDocumentsService,
  getSharedDocumentsService,
};
