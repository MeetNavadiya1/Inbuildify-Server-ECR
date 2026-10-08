import { Op } from "sequelize";
import db from "../../config/database/models/postgre-models/index.js";
import jobService from "../job/job.service.js";
import leadsService from "../lead/leads.service.js";
import { virtualFolderId } from "../../helper/virtualFolderId.helper.js";
import { env } from "../../config/env.config.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  resolveUserEntityIds,
  collectUserReferenceIds,
  resolveUserForEntity,
} from "./documents.user-scope.js";

/**
 * ─── User Documents tree ─────────────────────────────────────────────────────
 *
 * The user-scoped counterpart to getJobDocuments / getLeadDocuments: one tree
 * holding every document attached to a user, no matter which Lead or Job it
 * hangs off.
 *
 *   Documents
 *   ├─ Leads
 *   │  └─ <Lead name (LD2026001)>  ← that lead's whole tree, minus its own root
 *   ├─ Jobs
 *   │  └─ <Job JB2026004>          ← that job's whole tree, minus its own root
 *   └─ Uploads                     ← files the user uploaded outside those
 *
 * Each entity child is produced by the entity's existing aggregator, so the
 * quotation / variation / invoice buckets, the approval flags and the
 * user-created folders all stay byte-identical to what the per-entity tab shows.
 * The entity's own "Documents" root is unwrapped and re-labelled with the
 * lead/job name — that label, and the Leads / Jobs section it sits under, are
 * the only things this layer adds.
 *
 * A section with nothing under it is left out rather than shown empty, which is
 * the same rule wrapEntityRoot applies to an entity carrying no documents.
 */

// A user with a very long history would otherwise fan out into hundreds of
// aggregator calls on a single request. Newest leads/jobs win, and the response
// says plainly how many were left out rather than looking complete.
const MAX_ENTITIES = 150;

const s3BaseUrl = () => `https://${env.AWS.S3_BUCKET_NAME}.s3.amazonaws.com`;
const toPublicUrl = (key) => {
  if (!key) {
    return key;
  }
  if (/^https?:\/\//i.test(key)) {
    return key;
  }
  return `${s3BaseUrl()}/${key.replace(/^\/+/, "")}`;
};

/** Wrap an aggregator's root as a named child folder of the user's root. */
function wrapEntityRoot(root, label) {
  if (!root) {
    return null;
  }
  const files = root.files || [];
  const subFolders = root.subFolders || [];
  const count = files.length + subFolders.reduce((sum, sf) => sum + (sf.count || 0), 0);
  if (!count) {
    return null;
  } // an entity with no documents adds only noise
  return {
    folderId: root.folderId, // already a stable per-entity virtual id
    folderName: label,
    ownerName: "System",
    isSystem: true,
    count,
    files,
    subFolders,
  };
}

/**
 * Gather the per-entity folders of one kind under a single named section.
 *
 * @param {string} userId    scopes the section's virtual id to this user
 * @param {string} key       "leads" | "jobs" — the id seed, not shown anywhere
 * @param {string} label     the folder name the explorer renders
 * @param {object[]} folders already-wrapped entity roots, newest first
 * @returns {object|null} null when there is nothing to show, so the caller can
 *          drop the section instead of rendering an empty folder.
 */
function buildSection(userId, key, label, folders) {
  if (!folders.length) {
    return null;
  }
  return {
    folderId: virtualFolderId(userId, `section_${key}`),
    folderName: label,
    ownerName: "System",
    isSystem: true,
    count: folders.reduce((sum, f) => sum + (f.count || 0), 0),
    files: [],
    subFolders: folders,
  };
}

/**
 * Every document attached to `userId`, across all their leads and jobs.
 *
 * @param {string} userId
 * @param {object} requester  the authenticated caller (tenant boundary)
 * @returns {Promise<{success:boolean, statusCode?:number, message:string, data?:object[]}>}
 */
export async function getUserDocuments(userId, requester) {
  try {
    const resolved = await resolveUserEntityIds(userId, requester);
    if (!resolved) {
      return { success: false, statusCode: 404, message: "User not found or unauthorized" };
    }

    const { user, leadIds, jobIds } = resolved;

    // Labels for the per-entity folders, newest first — the same order that
    // decides what survives the MAX_ENTITIES cap.
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

    const entities = [
      ...jobs.map((j) => ({
        kind: "job",
        id: j.job_id,
        createdAt: j.createdAt,
        label: j.reference_number ? `Job ${j.reference_number}` : "Job",
      })),
      ...leads.map((l) => ({
        kind: "lead",
        id: l.leads_id,
        createdAt: l.createdAt,
        label: l.reference_number ? `${l.name} (${l.reference_number})` : l.name || "Lead",
      })),
    ].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    const visible = entities.slice(0, MAX_ENTITIES);
    const omitted = entities.length - visible.length;
    if (omitted > 0) {
      console.warn(
        `getUserDocuments: user ${userId} has ${entities.length} leads/jobs; showing the ${MAX_ENTITIES} most recent, ${omitted} omitted.`,
      );
    }

    // Reuse the per-entity aggregators verbatim so every bucket, approval flag
    // and user folder matches the Job / Lead Documents tab exactly.
    const trees = await Promise.all(
      visible.map(async (entity) => {
        const result =
          entity.kind === "job"
            ? await jobService.getJobDocuments(entity.id, requester)
            : await leadsService.getLeadDocuments(
              entity.id,
              requester?.builder_id,
              requester?.company_id,
            );
        if (!result?.success) {
          return null;
        }
        const folder = wrapEntityRoot(result.data?.[0], entity.label);
        return folder ? { kind: entity.kind, folder } : null;
      }),
    );

    // `visible` is already newest-first, and filter preserves that order, so
    // each section lists its entities newest-first too.
    const foldersOfKind = (kind) =>
      trees.filter((t) => t?.kind === kind).map((t) => t.folder);

    // Anything the user uploaded that is not attached to one of their leads or
    // jobs — global-drive uploads, or files on an entity someone else owns.
    const uploadsFolder = await buildUploadsFolder(userId, requester, resolved);

    const subFolders = [
      buildSection(userId, "leads", "Leads", foldersOfKind("lead")),
      buildSection(userId, "jobs", "Jobs", foldersOfKind("job")),
      uploadsFolder,
    ].filter(Boolean);

    const root = {
      folderId: virtualFolderId(userId, "root_documents"),
      folderName: "Documents",
      ownerName: user.name || "System",
      isSystem: true,
      count: subFolders.reduce((sum, sf) => sum + sf.count, 0),
      files: [],
      subFolders,
      // Non-tree metadata the UI can surface alongside the explorer.
      user: {
        usersId: user.users_id,
        name: user.name,
        email: user.email,
        initials: user.initials,
        photo: user.photo,
      },
      leadCount: leads.length,
      jobCount: jobs.length,
      truncated: omitted > 0,
      omittedEntityCount: omitted,
    };

    return { success: true, data: [root], message: "User documents fetched successfully" };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

/**
 * The "Uploads" bucket: files this user uploaded that no lead/job tree already
 * shows. Excluding the known reference ids is what keeps a file from appearing
 * twice in the same tree.
 */
async function buildUploadsFolder(userId, requester, resolved) {
  const collected = await collectUserReferenceIds(userId, requester, resolved);
  const referenceIds = collected?.referenceIds || [];

  const tenant = [];
  if (requester?.builder_id) {
    tenant.push({ builder_id: requester.builder_id });
  }
  if (requester?.company_id) {
    tenant.push({ company_id: requester.company_id });
  }
  if (!tenant.length) {
    return null;
  }

  const where = {
    [Op.and]: [
      { [Op.or]: tenant },
      { uploaded_by: userId },
      referenceIds.length
        ? { [Op.or]: [{ reference_id: null }, { reference_id: { [Op.notIn]: referenceIds } }] }
        : {},
    ],
  };

  const rows = await db.DriveFile.findAll({ where, order: [["created_at", "DESC"]] });
  if (!rows.length) {
    return null;
  }

  const files = rows.map((f) => {
    const plain = f.get({ plain: true });
    const url = toPublicUrl(plain.s3_key);
    return { ...keysToCamelCase(plain), s3Key: url, url };
  });

  return {
    folderId: virtualFolderId(userId, "uploads"),
    folderName: "Uploads",
    ownerName: "System",
    isSystem: true,
    count: files.length,
    files,
    subFolders: [],
  };
}

/**
 * The customers a documents browser can be pointed at: everyone in the caller's
 * tenant who is the named contact on a lead, or the customer contact on a job.
 *
 * Membership is derived from those two links alone, never from who happens to
 * own or have touched the paperwork — a salesperson holding thirty leads is
 * staff, not a customer, and does not belong on this list. Both links point at
 * a Contact-role user by construction (createLeadContactMap refuses anything
 * else, and a job's customer_contact_id is copied from that same map), so no
 * role-name match is needed here.
 *
 * A lead that has not converted yet still has its contact, which is what puts
 * that customer on the list from the moment the lead is created.
 *
 * Each row carries how much work is attached (leadCount / jobCount /
 * uploadCount) rather than an exact document total — a true total would mean
 * resolving every customer's reference set on a list request. The real count
 * comes back with the tree when a customer is opened.
 */
export async function listDocumentUsers(requester, filters = {}) {
  try {
    const tenant = [];
    if (requester?.builder_id) {
      tenant.push({ builder_id: requester.builder_id });
    }
    if (requester?.company_id) {
      tenant.push({ company_id: requester.company_id });
    }
    if (!tenant.length) {
      return { success: true, data: { items: [], total: 0 }, message: "No customers found" };
    }
    const tenantWhere = { [Op.or]: tenant };

    // Set-based throughout — never one query per customer.
    const [leadRows, jobRows] = await Promise.all([
      db.Leads.findAll({ where: tenantWhere, attributes: ["leads_id"] }),
      db.Job.findAll({
        where: tenantWhere,
        attributes: ["job_id", "opportunity_id", "customer_contact_id"],
      }),
    ]);

    const leadIds = leadRows.map((l) => l.leads_id);

    // leads_contact_map is the customer↔lead link. Scoped through the tenant's
    // own leads so a map row from another tenant cannot introduce a customer.
    const contactMaps = leadIds.length
      ? await db.LeadsContactMap.findAll({
        where: { leads_id: { [Op.in]: leadIds } },
        attributes: ["leads_id", "contact_id"],
      })
      : [];

    const addTo = (map, key, value) => {
      if (!key) {
        return;
      }
      if (!map.has(key)) {
        map.set(key, new Set());
      }
      map.get(key).add(value);
    };

    const leadsByUser = new Map();
    const contactsByLead = new Map();
    for (const m of contactMaps) {
      addTo(leadsByUser, m.contact_id, m.leads_id);
      addTo(contactsByLead, m.leads_id, m.contact_id);
    }

    // A job reaches its customer two ways, and the tree shows it under both: the
    // customer_contact_id stamped at conversion, and the contacts on the lead
    // the job came from (which is what resolveUserEntityIds closes over). Count
    // it the same way here, so the row summary matches the tree it opens.
    const opportunityIds = [
      ...new Set(jobRows.map((j) => j.opportunity_id).filter(Boolean)),
    ];
    const opportunities = opportunityIds.length
      ? await db.Opportunity.findAll({
        where: { opportunity_id: { [Op.in]: opportunityIds } },
        attributes: ["opportunity_id", "leads_id"],
      })
      : [];
    const leadByOpportunity = new Map(
      opportunities.map((o) => [o.opportunity_id, o.leads_id]),
    );

    const jobsByUser = new Map();
    for (const j of jobRows) {
      addTo(jobsByUser, j.customer_contact_id, j.job_id);
      const leadId = leadByOpportunity.get(j.opportunity_id);
      for (const contactId of contactsByLead.get(leadId) || []) {
        addTo(jobsByUser, contactId, j.job_id);
      }
    }

    const userIds = [...new Set([...leadsByUser.keys(), ...jobsByUser.keys()])];
    if (!userIds.length) {
      return { success: true, data: { items: [], total: 0 }, message: "No customers found" };
    }

    // Uploads only annotate a row now — they never put someone on the list, or
    // every staff member who has ever uploaded a file would be a customer.
    const uploadRows = await db.DriveFile.findAll({
      where: { [Op.and]: [tenantWhere, { uploaded_by: { [Op.in]: userIds } }] },
      attributes: [
        "uploaded_by",
        [db.sequelize.fn("COUNT", db.sequelize.col("file_id")), "count"],
      ],
      group: ["uploaded_by"],
      raw: true,
    });
    const uploadsByUser = new Map(
      uploadRows.map((r) => [r.uploaded_by, parseInt(r.count, 10) || 0]),
    );

    const where = {
      [Op.and]: [
        { users_id: { [Op.in]: userIds } },
        { is_deleted: false },
        tenantWhere,
        filters.search
          ? {
            [Op.or]: [
              { name: { [Op.iLike]: `%${filters.search}%` } },
              { email: { [Op.iLike]: `%${filters.search}%` } },
            ],
          }
          : {},
      ],
    };

    const users = await db.Users.findAll({
      where,
      attributes: [
        "users_id", "name", "email", "initials", "photo", "designation", "createdAt",
      ],
      include: [{ model: db.Role, as: "role", attributes: ["role_id", "name"] }],
      order: [["name", "ASC"]],
    });

    const items = users.map((u) => {
      const plain = u.get({ plain: true });
      return {
        ...keysToCamelCase(plain),
        leadCount: leadsByUser.get(u.users_id)?.size || 0,
        jobCount: jobsByUser.get(u.users_id)?.size || 0,
        uploadCount: uploadsByUser.get(u.users_id) || 0,
      };
    });

    return {
      success: true,
      data: { items, total: items.length },
      message: "Customers fetched successfully",
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

/**
 * Resolve the Job/Lead a request is about into the user its documents should be
 * grouped under, then return that user's whole tree. Powers `view=user` on the
 * per-entity Documents tabs.
 */
export async function getUserDocumentsForEntity(entityType, entityId, requester) {
  const userId = await resolveUserForEntity(entityType, entityId, requester);
  if (!userId) {
    // Nobody is attached yet (no customer contact, supervisor or assignee).
    // `noUser` tells the caller to fall back to this entity's own tree rather
    // than failing the Documents tab outright.
    return {
      success: false,
      noUser: true,
      statusCode: 404,
      message: `No user is attached to this ${entityType} yet`,
    };
  }
  return getUserDocuments(userId, requester);
}

export default { getUserDocuments, getUserDocumentsForEntity, listDocumentUsers };
