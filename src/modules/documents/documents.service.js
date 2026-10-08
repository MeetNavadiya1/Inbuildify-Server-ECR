import { Op } from "sequelize";
import db from "../../config/database/models/postgre-models/index.js";
import { getEntityAdapter } from "./documents.entities.js";
import {
  collectUserReferenceIds,
  collectLeadReferenceIds,
  collectJobReferenceIds,
} from "./documents.user-scope.js";
import { uploadFileService, createFolderService } from "../drive/drive.service.js";
import { isPdfEditable, getPdfTypeTag } from "../../utils/pdfEdit.js";
import { isDocumentEditingAllowed } from "../../utils/documentEdit.js";
import { virtualFolderId } from "../../helper/virtualFolderId.helper.js";
import { env } from "../../config/env.config.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  DOCUMENT_TYPE_CATEGORIES,
  DOCUMENT_TYPE_OPTIONS,
  documentTypeOf,
} from "../../constants/driveFile.js";

// Re-exported so existing importers (documents.validation) keep working.
export { DOCUMENT_TYPE_OPTIONS };

/**
 * ─── Generic Documents service ────────────────────────────────────────────────
 *
 * The single home for "create a folder" and "upload a file" against any owning
 * entity. Job/Lead/SDrive differ only in the metadata carried by the entity
 * adapter (see documents.entities.js); the storage primitives — the polymorphic
 * Drive / DriveFile tables and the shared `uploadFileService` — are identical.
 *
 * Every method returns a `{ success, statusCode?, message, data? }` envelope so
 * both the generic controller and the thin entity-specific delegators
 * (JobService.createJobFolder, LeadsService.createLeadFolder …) can forward it
 * verbatim.
 */

/** Common folder response shape shared by all entities. */
function toFolderResponse(folder, user) {
  return {
    folderId: folder.drive_id,
    folderName: folder.name,
    parentId: folder.parent_id || null,
    ownerName: user?.name || "—",
    count: 0,
    files: [],
    subFolders: [],
  };
}

/**
 * The Drive `where` that isolates one entity's folders. Entity-scoped types
 * (Job/Lead) key on reference_id + reference_type; the global drive (SDrive)
 * keys on a null reference within the caller's company.
 */
function folderScopeWhere(adapter, entityId, owner) {
  if (adapter.folderReferenceType) {
    return { reference_id: entityId, reference_type: adapter.folderReferenceType };
  }
  return { reference_id: null, reference_type: null, company_id: owner.company_id };
}

// Real drive folders are v4 UUIDs (gen_random_uuid); the computed "system"
// buckets in the Job/Lead trees are v5 (virtualFolderId). The version nibble
// (char index 14) tells them apart without enumerating every bucket key.
function isVirtualFolderId(id) {
  return (
    typeof id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) &&
    id.charAt(14) === "5"
  );
}

/**
 * Resolve a client-supplied parentId / folderId into how it should be treated.
 *   { atRoot: true }  → create/upload at the tree root (parent/folder = null).
 *                       Covers null, "root", and the virtual Documents-root id
 *                       that GET now returns for the top-level folder.
 *   { system: true }  → a computed bucket (Quotation, Variations, …) — not a
 *                       real row, so it can't be a parent/target.
 *   { realId }        → a genuine user folder id to look up + validate.
 */
function classifyTargetFolder(adapter, entityId, rawId) {
  if (!rawId || rawId === "root") return { atRoot: true };
  if (adapter.folderReferenceType) {
    if (rawId === virtualFolderId(entityId, "root_documents")) return { atRoot: true };
    if (isVirtualFolderId(rawId)) return { system: true };
  }
  return { realId: rawId };
}

/**
 * Create a folder in an entity's document tree.
 * @param {{entityType:string, entityId?:string, name:string, parentId?:string}} input
 */
export async function createFolder({ entityType, entityId, name, parentId } = {}, user) {
  const adapter = getEntityAdapter(entityType);
  if (!adapter) return { success: false, statusCode: 400, message: "Unsupported entity type" };
  if (adapter.readOnly) {
    return {
      success: false,
      statusCode: 400,
      message: `${adapter.label} documents are a read-only view. Create the folder on the job or lead it belongs to.`,
    };
  }

  const folderName = (name || "").trim();
  if (!folderName) return { success: false, statusCode: 400, message: "Folder name is required" };

  if (adapter.requiresEntityId && !entityId) {
    return { success: false, statusCode: 400, message: `${adapter.label} ID is required` };
  }

  const owner = await adapter.resolveOwner(entityId, user);
  if (!owner) {
    return { success: false, statusCode: 404, message: `${adapter.label} not found or unauthorized` };
  }

  // The Documents root (and null / "root") means "top level"; a system bucket
  // can't hold user folders.
  const target = classifyTargetFolder(adapter, entityId, parentId);
  if (target.system) {
    return {
      success: false,
      statusCode: 400,
      message:
        "You can create folders only at the Documents root or inside a folder you created. System folders (e.g. Quotation, Variations) can't contain folders.",
    };
  }

  // SDrive (global drive): reuse the existing Drive folder service so its
  // company-scoped dedupe and activity logging stay identical to POST
  // /drive/folders. It throws a friendly message on a duplicate name.
  if (!adapter.folderReferenceType) {
    try {
      const folder = await createFolderService({
        name: folderName,
        parent_id: target.atRoot ? null : target.realId,
        company_id: owner.company_id,
        builder_id: owner.builder_id,
        created_by: user?.users_id || null,
        updated_by: user?.users_id || null,
      });
      return { success: true, data: toFolderResponse(folder, user), message: "Folder created successfully" };
    } catch (error) {
      // createFolderService throws a friendly message on a duplicate name; the
      // unique index on `drive` catches the same thing when two requests race
      // past that check at once, and should read the same way to the caller.
      const isDuplicate =
        /already exists/i.test(error.message || "") ||
        error?.name === "SequelizeUniqueConstraintError";
      return {
        success: false,
        statusCode: isDuplicate ? 409 : 400,
        message: isDuplicate
          ? "A folder with this name already exists in this location."
          : error.message,
      };
    }
  }

  // Entity-scoped (Job/Lead) folder.
  const scope = folderScopeWhere(adapter, entityId, owner);

  let parent_id = null;
  if (target.realId) {
    const parent = await db.Drive.findOne({
      where: { drive_id: target.realId, ...scope },
      attributes: ["drive_id"],
    });
    if (!parent) return { success: false, statusCode: 400, message: "Invalid parent folder" };
    parent_id = parent.drive_id;
  }

  // Reject a duplicate name in the same location for this entity.
  const existing = await db.Drive.findOne({
    where: { name: folderName, parent_id, ...scope },
    attributes: ["drive_id"],
  });
  if (existing) {
    return { success: false, statusCode: 409, message: "A folder with this name already exists here" };
  }

  let folder;
  try {
    folder = await db.Drive.create({
      name: folderName,
      parent_id,
      company_id: owner.company_id,
      builder_id: owner.builder_id,
      created_by: user?.users_id || null,
      reference_id: entityId,
      reference_type: adapter.folderReferenceType,
    });
  } catch (error) {
    // The check above loses to a second request submitting the same name at the
    // same moment; the unique index on `drive` is what actually stops the pair,
    // and the caller should see the same 409 either way.
    if (error?.name !== "SequelizeUniqueConstraintError") throw error;
    return { success: false, statusCode: 409, message: "A folder with this name already exists here" };
  }

  return { success: true, data: toFolderResponse(folder, user), message: "Folder created successfully" };
}

/**
 * Upload a file into an entity's document tree. An optional folderId nests it
 * inside a user folder; otherwise it lands at the tree root.
 * @param {{entityType:string, entityId?:string, folderId?:string}} input
 */
export async function uploadFile({ entityType, entityId, folderId } = {}, file, user) {
  const adapter = getEntityAdapter(entityType);
  if (!adapter) return { success: false, statusCode: 400, message: "Unsupported entity type" };
  if (adapter.readOnly) {
    return {
      success: false,
      statusCode: 400,
      message: `${adapter.label} documents are a read-only view. Upload the file to the job or lead it belongs to.`,
    };
  }
  if (!file) return { success: false, statusCode: 400, message: "No file provided" };

  if (adapter.requiresEntityId && !entityId) {
    return { success: false, statusCode: 400, message: `${adapter.label} ID is required` };
  }

  const owner = await adapter.resolveOwner(entityId, user);
  if (!owner) {
    return { success: false, statusCode: 404, message: `${adapter.label} not found or unauthorized` };
  }

  // Resolve the target folder: the Documents root (and null / "root") lands the
  // file at the tree root; a system bucket can't hold uploads; a real folder is
  // validated against the same scope.
  const target = classifyTargetFolder(adapter, entityId, folderId);
  if (target.system) {
    return {
      success: false,
      statusCode: 400,
      message:
        "You can upload only to the Documents root or into a folder you created. System folders (e.g. Quotation, Variations) can't hold uploaded files.",
    };
  }

  let folder_id = null;
  if (target.realId) {
    const folder = await db.Drive.findOne({
      where: { drive_id: target.realId, ...folderScopeWhere(adapter, entityId, owner) },
      attributes: ["drive_id"],
    });
    if (!folder) return { success: false, statusCode: 400, message: "Invalid target folder" };
    folder_id = folder.drive_id;
  }

  const newFile = await uploadFileService(file, {
    company_id: owner.company_id,
    builder_id: owner.builder_id,
    uploaded_by: user?.users_id || null,
    folder_id,
    lead_id: owner.lead_id || null,
    // Entity-scoped uploads carry the polymorphic reference so aggregators
    // (getJobDocuments / getLeadDocuments) surface them; SDrive uploads leave it
    // null, exactly like POST /drive/files/upload.
    reference_id: adapter.fileReferenceType ? entityId : null,
    reference_type: adapter.fileReferenceType,
    sub_reference_type: null,
  });

  return {
    success: true,
    data: {
      fileId: newFile.file_id,
      originalName: newFile.original_name,
      folderId: folder_id,
    },
    message: "File uploaded successfully",
  };
}

// reference_type values that originate from a Job. Everything non-null that is
// NOT in this set is treated as Lead-scoped (lead uploads + the lead's quotation
// / property / engineering documents); a null reference_type is a global drive
// file. Used only to derive a display `scope` and to power the optional filter.
const JOB_REFERENCE_TYPES = new Set([
  "Job",
  "JobDocument",
  "JobProcessTask",
  "JobVariationInvoiceDocument",
  "JobVariationSignedDocument",
  "JobVariationDocument",
  "JobInvoiceDocument",
  "JobInvoiceReceiptDocument",
]);

function documentScope(referenceType) {
  if (!referenceType) return "drive";
  if (JOB_REFERENCE_TYPES.has(referenceType)) return "job";
  return "lead";
}

/**
 * The Sequelize `where` fragment that selects one document-type category. The
 * category taxonomy itself lives in constants/driveFile.js (shared with the
 * recents/list views); this is just the query builder around it.
 */
export function documentTypeWhere(type) {
  const def = DOCUMENT_TYPE_CATEGORIES[type];
  if (!def) return null;
  const or = [];
  if (def.referenceTypes?.length) or.push({ reference_type: { [Op.in]: def.referenceTypes } });
  if (def.subReferenceTypes?.length) or.push({ sub_reference_type: { [Op.in]: def.subReferenceTypes } });
  if (def.includeNullReference) or.push({ reference_type: null });
  if (!or.length) return null;
  return { [Op.or]: or };
}

/**
 * Consolidated, flat list of every document the caller can access — across all
 * jobs, leads and the global drive, ignoring folder structure. Access is bounded
 * by the caller's tenant (builder_id / company_id), the same boundary the
 * per-entity document tabs use.
 *
 * `userId` narrows the list to one user's documents — every file attached to a
 * lead or job that user owns, supervises or is the customer contact on, plus
 * anything they uploaded themselves. That is a superset of `uploadedBy`, which
 * still means only "the user who pressed upload".
 *
 * Advanced filters (all combinable — each adds an AND condition):
 *   builderId    → files owned by that builder (multi-builder companies)
 *   customerId   → a lead/client's documents (its refs + denormalised lead_id)
 *   projectId    → a job's documents (its refs: job + variations + invoices)
 *   documentType → a business category (see DOCUMENT_TYPE_CATEGORIES)
 *   dateFrom/dateTo → created_at window (inclusive; ISO datetimes)
 *
 * @param {{page?:number, limit?:number, search?:string, scope?:"job"|"lead"|"drive",
 *          uploadedBy?:string, userId?:string, starred?:boolean, builderId?:string,
 *          customerId?:string, projectId?:string, documentType?:string,
 *          dateFrom?:string, dateTo?:string}} filters
 */
export async function getAllDocuments(user, filters = {}) {
  try {
    const builderId = user?.builder_id;
    const companyId = user?.company_id;

    const settings = await db.GeneralSettings.findOne({
      where: { company_id: companyId }
    });
    const editablePdfTypes = settings?.editable_pdf_types || [];
    const blockedTypes = settings?.non_editable_document_types || [];

    const page = Math.max(parseInt(filters.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(filters.limit, 10) || 20, 1), 100);
    const offset = (page - 1) * limit;

    const tenant = [];
    if (builderId) tenant.push({ builder_id: builderId });
    if (companyId) tenant.push({ company_id: companyId });
    if (!tenant.length) {
      return { success: true, data: { items: [], page, limit, total: 0, totalPages: 0 }, message: "No documents found" };
    }

    const conditions = [{ [Op.or]: tenant }];

    // Optional origin filter (best-effort — see documentScope).
    if (filters.scope === "drive") conditions.push({ reference_type: null });
    else if (filters.scope === "job") conditions.push({ reference_type: { [Op.in]: [...JOB_REFERENCE_TYPES] } });
    else if (filters.scope === "lead") conditions.push({ reference_type: { [Op.ne]: null, [Op.notIn]: [...JOB_REFERENCE_TYPES] } });

    if (filters.uploadedBy) conditions.push({ uploaded_by: filters.uploadedBy });

    // Builder-wise: only meaningful in a multi-builder company; harmless (already
    // implied) for a builder-scoped caller.
    if (filters.builderId) conditions.push({ builder_id: filters.builderId });

    // Documents "belonging to" a user: anything hanging off a lead/job they are
    // attached to (via any of the collected reference ids, or the denormalised
    // lead_id), plus anything they uploaded anywhere else.
    if (filters.userId) {
      const collected = await collectUserReferenceIds(filters.userId, user);
      if (!collected) {
        return { success: false, statusCode: 404, message: "User not found or unauthorized" };
      }
      const ownership = [{ uploaded_by: filters.userId }];
      if (collected.referenceIds.length) {
        ownership.push({ reference_id: { [Op.in]: collected.referenceIds } });
      }
      if (collected.leadIds.length) {
        ownership.push({ lead_id: { [Op.in]: collected.leadIds } });
      }
      conditions.push({ [Op.or]: ownership });
    }

    // Customer-wise: a customer is a lead/client. Match its reference set or the
    // denormalised lead_id column.
    if (filters.customerId) {
      const lead = await collectLeadReferenceIds(filters.customerId, user);
      if (!lead) {
        return { success: false, statusCode: 404, message: "Customer not found or unauthorized" };
      }
      const ownership = [{ lead_id: filters.customerId }];
      if (lead.referenceIds.length) {
        ownership.push({ reference_id: { [Op.in]: lead.referenceIds } });
      }
      conditions.push({ [Op.or]: ownership });
    }

    // Project-wise: a project is a job. Match its reference set (job + variations
    // + invoices).
    if (filters.projectId) {
      const job = await collectJobReferenceIds(filters.projectId, user);
      if (!job) {
        return { success: false, statusCode: 404, message: "Project not found or unauthorized" };
      }
      conditions.push({ reference_id: { [Op.in]: job.referenceIds.length ? job.referenceIds : [filters.projectId] } });
    }

    // Document Type: a business category (quotation, colour, variation, …).
    if (filters.documentType) {
      const typeWhere = documentTypeWhere(filters.documentType);
      if (typeWhere) conditions.push(typeWhere);
    }

    // Date range on created_at (inclusive). Callers send ISO datetimes; a
    // date-only "to" should include that whole day, so bump it to end-of-day.
    const createdAt = {};
    if (filters.dateFrom) createdAt[Op.gte] = new Date(filters.dateFrom);
    if (filters.dateTo) {
      const to = new Date(filters.dateTo);
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(filters.dateTo))) to.setHours(23, 59, 59, 999);
      createdAt[Op.lte] = to;
    }
    if (Object.getOwnPropertySymbols(createdAt).length) conditions.push({ created_at: createdAt });

    if (typeof filters.starred === "boolean") conditions.push({ is_starred: filters.starred });
    if (filters.search) conditions.push({ original_name: { [Op.iLike]: `%${filters.search}%` } });

    // Paranoid model excludes soft-deleted rows automatically.
    const { rows, count } = await db.DriveFile.findAndCountAll({
      where: { [Op.and]: conditions },
      include: [{ model: db.Users, as: "uploadedByUser", attributes: ["name"] }],
      order: [["created_at", "DESC"]],
      limit,
      offset,
    });

    // Resolve s3_key into a fully-qualified public URL, mirroring the per-entity
    // aggregators so the frontend opens file.url / file.s3Key directly.
    const s3BaseUrl = `https://${env.AWS.S3_BUCKET_NAME}.s3.amazonaws.com`;
    const toPublicUrl = (key) =>
      key && !/^https?:\/\//i.test(key) ? `${s3BaseUrl}/${key.replace(/^\/+/, "")}` : key;

    const plains = rows.map((f) => f.get({ plain: true }));

    // The customer (lead) each file belongs to, for display. Generated reports
    // and lead/job uploads carry the denormalised lead_id; a direct Lead
    // reference covers the rest. One batched lookup, whatever the page size.
    const leadIdOf = (plain) =>
      plain.lead_id ||
      (plain.reference_type === "Lead" || plain.reference_type === "LeadDocument"
        ? plain.reference_id
        : null);

    const leadIds = [...new Set(plains.map(leadIdOf).filter(Boolean))];
    const leadMap = new Map();
    if (leadIds.length) {
      const leads = await db.Leads.findAll({
        where: { leads_id: { [Op.in]: leadIds } },
        attributes: ["leads_id", "name", "reference_number"],
      });
      for (const l of leads) {
        leadMap.set(l.leads_id, { name: l.name || null, reference: l.reference_number || null });
      }
    }

    const items = plains.map((plain) => {
      const url = toPublicUrl(plain.s3_key);
      const documentType = documentTypeOf(plain.reference_type, plain.sub_reference_type);
      const leadId = leadIdOf(plain);
      const customer = leadId ? leadMap.get(leadId) : null;
      return {
        ...keysToCamelCase(plain),
        s3Key: url,
        url,
        uploadedByName: plain.uploadedByUser?.name || null,
        uploaded_by_name: plain.uploadedByUser?.name || null,
        scope: documentScope(plain.reference_type),
        documentType,
        documentTypeLabel: documentType ? DOCUMENT_TYPE_CATEGORIES[documentType].label : null,
        customerId: customer ? leadId : null,
        customerName: customer?.name || null,
        customerReference: customer?.reference || null,
        isEditable: isPdfEditable(plain, editablePdfTypes, blockedTypes),
        is_editable: isPdfEditable(plain, editablePdfTypes, blockedTypes),
        // Whether this document may be edited at all — the Admin → Document
        // Management switch. Distinct from `is_editable` above, which only says whether a
        // generated PDF offers the edit-the-record form.
        editing_allowed: isDocumentEditingAllowed(plain, blockedTypes),
        editingAllowed: isDocumentEditingAllowed(plain, blockedTypes),
        pdfType: getPdfTypeTag(plain),
        pdf_type: getPdfTypeTag(plain),
      };
    });

    return {
      success: true,
      data: { items, page, limit, total: count, totalPages: Math.ceil(count / limit) },
      message: "Documents fetched successfully",
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

/**
 * The option lists that populate the Documents filter bar, all in one
 * tenant-scoped round-trip:
 *   builders   — the company's builders (empty/one for a builder-scoped caller,
 *                so the UI can hide the filter when there's nothing to choose)
 *   customers  — leads/clients, newest first
 *   projects   — jobs, newest first
 *   documentTypes — the static business categories
 *
 * Leads/jobs are capped so a large tenant can't return an unbounded list; the
 * dropdowns search client-side over what comes back.
 */
const FILTER_OPTION_LIMIT = 500;

export async function getFilterOptions(user) {
  try {
    const builderId = user?.builder_id;
    const companyId = user?.company_id;

    const tenant = [];
    if (builderId) tenant.push({ builder_id: builderId });
    if (companyId) tenant.push({ company_id: companyId });
    if (!tenant.length) {
      return {
        success: true,
        data: { builders: [], customers: [], projects: [], documentTypes: DOCUMENT_TYPE_OPTIONS },
        message: "No filter options",
      };
    }
    const tenantWhere = { [Op.or]: tenant };

    const [builders, leads, jobs] = await Promise.all([
      // Builder filter only makes sense across a company's builders.
      companyId
        ? db.Builder.findAll({
            where: { company_id: companyId },
            attributes: ["builder_id", "name", "firm_name"],
            order: [["name", "ASC"]],
          })
        : [],
      db.Leads.findAll({
        where: tenantWhere,
        // Leads/Job expose the timestamp as `createdAt` (underscored maps it to
        // the created_at column); DriveFile's own attribute is `created_at`.
        attributes: ["leads_id", "name", "reference_number", "createdAt"],
        order: [["createdAt", "DESC"]],
        limit: FILTER_OPTION_LIMIT,
      }),
      db.Job.findAll({
        where: tenantWhere,
        attributes: ["job_id", "reference_number", "createdAt"],
        order: [["createdAt", "DESC"]],
        limit: FILTER_OPTION_LIMIT,
      }),
    ]);

    return {
      success: true,
      data: {
        builders: builders.map((b) => ({
          value: b.builder_id,
          label: b.name || b.firm_name || "Builder",
        })),
        customers: leads.map((l) => ({
          value: l.leads_id,
          label: l.reference_number ? `${l.name} (${l.reference_number})` : l.name || "Lead",
        })),
        projects: jobs.map((j) => ({
          value: j.job_id,
          label: j.reference_number || "Job",
        })),
        documentTypes: DOCUMENT_TYPE_OPTIONS,
      },
      message: "Filter options fetched successfully",
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

export default { createFolder, uploadFile, getAllDocuments, getFilterOptions };
