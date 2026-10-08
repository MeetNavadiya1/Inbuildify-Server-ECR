import { Op } from "sequelize";
import db from "../../config/database/models/postgre-models/index.js";
import { collectUserReferenceIds } from "./documents.user-scope.js";
import { documentTypeWhere } from "./documents.service.js";
import { generatePresignedDownloadUrl } from "../../service/s3.service.js";
import { DOCUMENT_TYPE_CATEGORIES, DOCUMENT_TYPE_OPTIONS, documentTypeOf } from "../../constants/driveFile.js";

/**
 * ─── Client (Contact) documents ──────────────────────────────────────────────
 *
 * Powers the homebuyer's "My Documents" dashboard: a read-only, flat list of
 * every document on the caller's own account, plus a view/download link per
 * file. The caller IS the subject — there is no user id on the request — so a
 * Contact can never point this at someone else.
 *
 * Ownership is resolved ONLY through the two customer links:
 *
 *   leads_contact_map.contact_id   the customer named on a lead
 *   job.customer_contact_id        the homebuyer's portal contact on a job
 *
 * closed over the lead ⇄ job link (the jobs raised from their leads, and the
 * leads behind their jobs). Deliberately NOT resolveUserEntityIds: that also
 * walks assignee / created_by / supervisor, which are staff links and would be
 * wrong (and wider) for a customer.
 *
 * Those leads/jobs are expanded into every drive_files.reference_id their
 * paperwork can carry (quotation versions, property detail, variations,
 * invoices) by collectUserReferenceIds, and the files the Contact uploaded
 * themselves are folded in — all within the caller's tenant.
 *
 * S3 keys never leave this module: the list carries no URL, and a file is only
 * opened through getMyDocumentViewUrl, which re-checks ownership and presigns.
 */

// A presigned link is minted per click, so it only has to outlive the open.
const VIEW_URL_TTL_SECONDS = 15 * 60;

const uniq = (values) => [...new Set(values.filter(Boolean))];

function tenantConditions(user) {
  const tenant = [];
  if (user?.builder_id) tenant.push({ builder_id: user.builder_id });
  if (user?.company_id) tenant.push({ company_id: user.company_id });
  return tenant;
}

/**
 * The leads + jobs the Contact is the customer on, closed over lead ⇄ job.
 * @returns {Promise<{leadIds:string[], jobIds:string[]}>}
 */
async function resolveContactEntityIds(user) {
  const userId = user?.users_id;
  const tenant = tenantConditions(user);
  if (!userId || !tenant.length) return { leadIds: [], jobIds: [] };
  const tenantWhere = { [Op.or]: tenant };

  const contactMaps = await db.LeadsContactMap.findAll({
    where: { contact_id: userId },
    attributes: ["leads_id"],
  });
  const mappedLeadIds = uniq(contactMaps.map((m) => m.leads_id));

  // Re-read the mapped leads through the tenant so a map row pointing at another
  // tenant's lead brings nothing back.
  const [ownLeads, ownJobs] = await Promise.all([
    mappedLeadIds.length
      ? db.Leads.findAll({
        where: { [Op.and]: [tenantWhere, { leads_id: { [Op.in]: mappedLeadIds } }] },
        attributes: ["leads_id"],
      })
      : [],
    db.Job.findAll({
      where: { [Op.and]: [tenantWhere, { customer_contact_id: userId }] },
      attributes: ["job_id", "opportunity_id"],
    }),
  ]);

  const leadIds = new Set(ownLeads.map((l) => l.leads_id));
  const jobIds = new Set(ownJobs.map((j) => j.job_id));

  // Both hops go through `opportunity`.
  const jobOpportunityIds = uniq(ownJobs.map((j) => j.opportunity_id));
  const [opportunitiesOfJobs, opportunitiesOfLeads] = await Promise.all([
    jobOpportunityIds.length
      ? db.Opportunity.findAll({
        where: { opportunity_id: { [Op.in]: jobOpportunityIds } },
        attributes: ["leads_id"],
      })
      : [],
    leadIds.size
      ? db.Opportunity.findAll({
        where: { leads_id: { [Op.in]: [...leadIds] } },
        attributes: ["opportunity_id"],
      })
      : [],
  ]);

  // Leads behind the Contact's jobs — tenant-checked like every other hop.
  const leadsBehindJobs = uniq(opportunitiesOfJobs.map((o) => o.leads_id)).filter(
    (id) => !leadIds.has(id),
  );
  if (leadsBehindJobs.length) {
    const rows = await db.Leads.findAll({
      where: { [Op.and]: [tenantWhere, { leads_id: { [Op.in]: leadsBehindJobs } }] },
      attributes: ["leads_id"],
    });
    for (const l of rows) leadIds.add(l.leads_id);
  }

  // Jobs raised from the Contact's leads.
  const relatedOpportunityIds = uniq(opportunitiesOfLeads.map((o) => o.opportunity_id));
  if (relatedOpportunityIds.length) {
    const rows = await db.Job.findAll({
      where: { [Op.and]: [tenantWhere, { opportunity_id: { [Op.in]: relatedOpportunityIds } }] },
      attributes: ["job_id"],
    });
    for (const j of rows) jobIds.add(j.job_id);
  }

  return { leadIds: [...leadIds], jobIds: [...jobIds] };
}

/**
 * The DriveFile `where` that selects exactly the Contact's documents, plus the
 * resolved lead/job ids so callers can label or narrow by them.
 * @returns {Promise<null|{where:object, leadIds:string[], jobIds:string[]}>}
 *          null when the caller has no tenant (nothing can match).
 */
async function buildContactScope(user) {
  const tenant = tenantConditions(user);
  if (!user?.users_id || !tenant.length) return null;

  const resolved = await resolveContactEntityIds(user);
  const collected = await collectUserReferenceIds(user.users_id, user, { user, ...resolved });
  const referenceIds = collected?.referenceIds || [];

  const ownership = [{ uploaded_by: user.users_id }];
  if (referenceIds.length) ownership.push({ reference_id: { [Op.in]: referenceIds } });
  if (resolved.leadIds.length) ownership.push({ lead_id: { [Op.in]: resolved.leadIds } });

  return {
    where: { [Op.and]: [{ [Op.or]: tenant }, { [Op.or]: ownership }] },
    leadIds: resolved.leadIds,
    jobIds: resolved.jobIds,
  };
}

/** The Contact's leads/jobs as filter options ("projects" on the dashboard). */
async function loadProjects(leadIds, jobIds) {
  const [leads, jobs] = await Promise.all([
    leadIds.length
      ? db.Leads.findAll({
        where: { leads_id: { [Op.in]: leadIds } },
        attributes: ["leads_id", "name", "reference_number", "createdAt"],
        order: [["createdAt", "DESC"]],
      })
      : [],
    jobIds.length
      ? db.Job.findAll({
        where: { job_id: { [Op.in]: jobIds } },
        attributes: ["job_id", "reference_number", "createdAt"],
        order: [["createdAt", "DESC"]],
      })
      : [],
  ]);
  return [
    ...jobs.map((j) => ({
      id: j.job_id,
      type: "job",
      label: j.reference_number ? `Job ${j.reference_number}` : "Job",
    })),
    ...leads.map((l) => ({
      id: l.leads_id,
      type: "lead",
      label: l.reference_number ? `${l.name} (${l.reference_number})` : l.name || "Enquiry",
    })),
  ];
}

/**
 * The name a document goes by — the same one the builder sees in Drive.
 * `file_name` is generated from the naming format the administrator configures
 * under Admin → Integration → File Naming, so it is the source of truth;
 * `original_name` is only a fallback for legacy rows.
 */
const displayNameOf = (plain) => plain.file_name || plain.original_name;

/** Client-safe projection of a DriveFile row — no S3 key, no internal flags. */
function toClientDocument(plain) {
  const documentType = documentTypeOf(plain.reference_type, plain.sub_reference_type);
  return {
    fileId: plain.file_id,
    name: displayNameOf(plain),
    fileExtension: plain.file_extension,
    mimeType: plain.mime_type,
    size: plain.size != null ? Number(plain.size) : null,
    documentType,
    documentTypeLabel: documentType ? DOCUMENT_TYPE_CATEGORIES[documentType].label : "Other",
    uploadedByName: plain.uploadedByUser?.name || null,
    createdAt: plain.created_at,
  };
}

/**
 * GET /documents/my — paginated list of the Contact's own documents.
 *
 * @param {{page?:number, limit?:number, search?:string, documentType?:string,
 *          projectId?:string, dateFrom?:string, dateTo?:string}} filters
 *   projectId narrows to one of the Contact's own leads/jobs; any other id is
 *   simply not theirs and yields an empty page, never another customer's files.
 */
export async function getMyDocuments(user, filters = {}) {
  try {
    const page = Math.max(parseInt(filters.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(filters.limit, 10) || 20, 1), 100);
    const offset = (page - 1) * limit;
    const empty = {
      items: [], page, limit, total: 0, totalPages: 0, projects: [], documentTypes: DOCUMENT_TYPE_OPTIONS,
    };

    const scope = await buildContactScope(user);
    if (!scope) {
      return { success: true, data: empty, message: "No documents found" };
    }

    const conditions = [scope.where];

    if (filters.projectId) {
      const isLead = scope.leadIds.includes(filters.projectId);
      const isJob = scope.jobIds.includes(filters.projectId);
      if (!isLead && !isJob) {
        return { success: true, data: { ...empty, projects: await loadProjects(scope.leadIds, scope.jobIds) }, message: "No documents found" };
      }
      // Narrow within the already-owned set, so this can only ever shrink it.
      const narrowed = await collectUserReferenceIds(user.users_id, user, {
        user,
        leadIds: isLead ? [filters.projectId] : [],
        jobIds: isJob ? [filters.projectId] : [],
      });
      const projectOr = [{ reference_id: { [Op.in]: narrowed.referenceIds } }];
      if (isLead) projectOr.push({ lead_id: filters.projectId });
      conditions.push({ [Op.or]: projectOr });
    }

    if (filters.documentType) {
      const typeWhere = documentTypeWhere(filters.documentType);
      if (typeWhere) conditions.push(typeWhere);
    }

    const createdAt = {};
    if (filters.dateFrom) createdAt[Op.gte] = new Date(filters.dateFrom);
    if (filters.dateTo) {
      const to = new Date(filters.dateTo);
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(filters.dateTo))) to.setHours(23, 59, 59, 999);
      createdAt[Op.lte] = to;
    }
    if (Object.getOwnPropertySymbols(createdAt).length) conditions.push({ created_at: createdAt });

    // Match the name shown as well as the one the file was uploaded under.
    if (filters.search) {
      const pattern = `%${filters.search}%`;
      conditions.push({
        [Op.or]: [{ file_name: { [Op.iLike]: pattern } }, { original_name: { [Op.iLike]: pattern } }],
      });
    }

    const [{ rows, count }, projects] = await Promise.all([
      db.DriveFile.findAndCountAll({
        where: { [Op.and]: conditions },
        include: [{ model: db.Users, as: "uploadedByUser", attributes: ["name"] }],
        order: [["created_at", "DESC"]],
        limit,
        offset,
        distinct: true,
      }),
      loadProjects(scope.leadIds, scope.jobIds),
    ]);

    return {
      success: true,
      data: {
        items: rows.map((r) => toClientDocument(r.get({ plain: true }))),
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
        projects,
        documentTypes: DOCUMENT_TYPE_OPTIONS,
      },
      message: "Documents fetched successfully",
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

/**
 * GET /documents/my/:fileId/view — a short-lived link to open (or download) one
 * of the Contact's own documents. Anything outside their set is a 404, so the
 * response never confirms that someone else's file id exists.
 *
 * @param {{download?:boolean}} options download=true forces save-to-disk.
 */
export async function getMyDocumentViewUrl(user, fileId, { download = false } = {}) {
  try {
    const scope = await buildContactScope(user);
    if (!scope) {
      return { success: false, statusCode: 404, message: "Document not found" };
    }

    const file = await db.DriveFile.findOne({
      where: { [Op.and]: [{ file_id: fileId }, scope.where] },
      attributes: ["file_id", "file_name", "original_name", "s3_key", "mime_type", "reference_type", "sub_reference_type", "file_extension", "size", "created_at"],
    });
    if (!file) {
      return { success: false, statusCode: 404, message: "Document not found" };
    }

    // Saved under the name the list shows, so the download matches the row.
    const presigned = await generatePresignedDownloadUrl(
      file.s3_key,
      VIEW_URL_TTL_SECONDS,
      download ? displayNameOf(file) : undefined,
    );
    if (!presigned.success) {
      return { success: false, statusCode: 502, message: "Could not generate a link for this document" };
    }

    return {
      success: true,
      data: {
        ...toClientDocument(file.get({ plain: true })),
        url: presigned.url,
        expiresIn: VIEW_URL_TTL_SECONDS,
      },
      message: "Document link generated successfully",
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

export default { getMyDocuments, getMyDocumentViewUrl };
