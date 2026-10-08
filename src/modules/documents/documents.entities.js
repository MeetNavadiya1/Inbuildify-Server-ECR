import { Op } from "sequelize";
import db from "../../config/database/models/postgre-models/index.js";
import { MODULES, ACTIONS } from "../../constants/rbac.js";

/**
 * ─── Generic Documents — entity registry ──────────────────────────────────────
 *
 * Folder-creation and file-upload used to live only on Jobs. This registry makes
 * the same behaviour reusable for any owning entity by describing, per entity
 * type, everything the generic service needs:
 *
 *   • module            — RBAC module the permission guard checks
 *   • actions           — action required for each operation (read/folder/upload)
 *   • requiresEntityId  — whether an entity id must accompany the request
 *   • folderReferenceType / fileReferenceType — the polymorphic `reference_type`
 *       written on Drive folders / DriveFile rows. `null` means "global drive"
 *       (SDrive), i.e. not scoped to any entity.
 *   • resolveOwner()    — loads + authorizes the owning row (tenant-scoped) and
 *       returns the company/builder/lead ids the new folder or file inherits, or
 *       `null` when the entity is missing / not visible to the caller.
 *
 * Adding a new entity (e.g. Estate) is a single entry here — no controller,
 * route or service changes required.
 */

/**
 * A row is visible if it belongs to the caller's builder or company. Mirrors
 * JobService._buildTenantScope so entity ownership checks stay consistent.
 */
function buildTenantScope(user) {
  const conditions = [];
  if (user?.builder_id) conditions.push({ builder_id: user.builder_id });
  if (user?.company_id) conditions.push({ company_id: user.company_id });
  // No tenant on the token → a condition that can never match, so we never leak
  // rows to an unscoped caller.
  if (!conditions.length) {
    return { [Op.and]: [{ company_id: null }, { company_id: { [Op.ne]: null } }] };
  }
  return { [Op.or]: conditions };
}

export const DOCUMENT_ENTITIES = Object.freeze({
  job: {
    type: "job",
    label: "Job",
    module: MODULES.JOB,
    requiresEntityId: true,
    folderReferenceType: "Job",
    fileReferenceType: "JobDocument",
    // Creating a folder / uploading a file mutates the job's document tree, so it
    // is an UPDATE on the job — identical to the original /job routes.
    actions: { read: ACTIONS.READ, folder: ACTIONS.UPDATE, upload: ACTIONS.UPDATE },
    async resolveOwner(entityId, user) {
      const job = await db.Job.findOne({
        where: { job_id: entityId, ...buildTenantScope(user) },
        attributes: ["job_id", "company_id", "builder_id"],
        include: [
          {
            model: db.Opportunity,
            as: "opportunity",
            attributes: ["opportunity_id"],
            include: [{ model: db.Leads, as: "lead", attributes: ["leads_id"] }],
          },
        ],
      });
      if (!job) return null;
      return {
        company_id: job.company_id || user?.company_id || null,
        builder_id: job.builder_id || user?.builder_id || null,
        lead_id: job.opportunity?.lead?.leads_id || null,
      };
    },
  },

  lead: {
    type: "lead",
    label: "Lead",
    module: MODULES.LEAD,
    requiresEntityId: true,
    folderReferenceType: "Lead",
    fileReferenceType: "LeadDocument",
    actions: { read: ACTIONS.READ, folder: ACTIONS.UPDATE, upload: ACTIONS.UPDATE },
    async resolveOwner(entityId, user) {
      const lead = await db.Leads.findOne({
        where: { leads_id: entityId, ...buildTenantScope(user) },
        attributes: ["leads_id", "company_id", "builder_id"],
      });
      if (!lead) return null;
      return {
        company_id: lead.company_id || user?.company_id || null,
        builder_id: lead.builder_id || user?.builder_id || null,
        lead_id: lead.leads_id,
      };
    },
  },

  user: {
    type: "user",
    label: "User",
    // Spans every lead + job the user touches, so it is gated on the Document
    // module rather than on Job or Lead individually.
    module: MODULES.DOCUMENT,
    requiresEntityId: true,
    // A user is not a storage container — nothing is ever written against a
    // users_id. `readOnly` makes createFolder/uploadFile reject it with a clear
    // message instead of falling through to the reference-less SDrive branch.
    readOnly: true,
    folderReferenceType: null,
    fileReferenceType: null,
    actions: { read: ACTIONS.READ, folder: ACTIONS.CREATE, upload: ACTIONS.CREATE },
    async resolveOwner(entityId, user) {
      const target = await db.Users.findOne({
        where: { users_id: entityId, is_deleted: false, ...buildTenantScope(user) },
        attributes: ["users_id", "company_id", "builder_id"],
      });
      if (!target) return null;
      return {
        company_id: target.company_id || user?.company_id || null,
        builder_id: target.builder_id || user?.builder_id || null,
        lead_id: null,
      };
    },
  },

  sdrive: {
    type: "sdrive",
    label: "SDrive",
    module: MODULES.DOCUMENT,
    // Global drive has no owning entity — folders/files are scoped to the
    // caller's tenant only, matching POST /drive/folders and /drive/files/upload.
    requiresEntityId: false,
    folderReferenceType: null,
    fileReferenceType: null,
    actions: { read: ACTIONS.READ, folder: ACTIONS.CREATE, upload: ACTIONS.CREATE },
    async resolveOwner(_entityId, user) {
      return {
        company_id: user?.company_id || null,
        builder_id: user?.builder_id || null,
        lead_id: null,
      };
    },
  },
});

/** Case-insensitive adapter lookup. Returns null for unknown/missing types. */
export function getEntityAdapter(entityType) {
  if (!entityType) return null;
  return DOCUMENT_ENTITIES[String(entityType).toLowerCase()] || null;
}

export const SUPPORTED_ENTITY_TYPES = Object.freeze(Object.keys(DOCUMENT_ENTITIES));
