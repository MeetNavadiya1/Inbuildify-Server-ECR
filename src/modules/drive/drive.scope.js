/**
 * S Drive access scope — the single source of truth for "which drive rows may
 * this user see at all".
 *
 * Two tiers:
 *
 *   FULL ACCESS  (Super Admin + the four Company-Admin variants)
 *     The whole company drive: every file, folder, lead/job document and share.
 *
 *   RESTRICTED   (Builder, and every other non-admin role)
 *     Only paperwork that belongs to the leads and jobs of their own builder,
 *     plus what they uploaded themselves and what has been explicitly shared
 *     with them. Never another builder's files, and never the company-wide
 *     private drive (reference-less files someone else uploaded).
 *
 * Everything here returns Sequelize `where` fragments rather than ids where it
 * can, so the restriction is applied by the database on the same query that
 * fetches the rows — a listing endpoint cannot accidentally forget to filter,
 * and there is no "fetch then drop" window.
 *
 * The single-entity helpers (canAccessFile / canAccessFolder) exist so that
 * download, thumbnail, version and preview routes — which take an id straight
 * from the URL — are checked against exactly the same rule as the listings.
 * That is what closes direct-URL / id-manipulation access.
 */

import { Op } from "sequelize";
import db from "../../config/database/models/postgre-models/index.js";
import { ROLES } from "../../constants/rbac.js";
import { getRoleNameById } from "../../helper/rbac.helper.js";

/** Roles that administer the entire company drive. */
const FULL_ACCESS_ROLES = new Set([
  ROLES.SUPER_ADMIN,
  ROLES.COMPANY_ADMINISTRATOR,
  ROLES.MH_COMPANY_ADMIN,
  ROLES.MY_HOME_COMPANY_ADMIN,
  ROLES.MY_HOME_ADMIN,
]);

/**
 * Catalogue paperwork that is not attached to any one lead or job — floor plan
 * and facade drawings. A Builder needs these to work, and they are still
 * builder-scoped by the tenant predicate, so exposing them here does not leak
 * across builders.
 */
const CATALOGUE_REFERENCE_TYPES = Object.freeze(["FloorPlan", "Facade"]);

/** A `where` that can never match — used when a caller has no tenant at all. */
const MATCH_NOTHING = Object.freeze({ [Op.and]: [{ file_id: null }, { file_id: { [Op.ne]: null } }] });

const uniq = (values) => [...new Set(values.filter(Boolean))];

/** True when the user administers the whole company drive. */
export const hasFullDriveAccess = async (user) => {
  const roleName = user?.role_name || (await getRoleNameById(user?.role_id));
  return Boolean(roleName && FULL_ACCESS_ROLES.has(roleName));
};

/**
 * Every lead + job belonging to the caller's builder.
 *
 * "Assigned" for a Builder means builder_id — that is the role's documented
 * scope (RBAC §6, ROLE_SCOPES[BUILDER] = SCOPES.BUILDER) and it is what keeps
 * one builder's work out of another's drive.
 */
export const getBuilderEntityIds = async (user) => {
  const builderId = user?.builder_id;
  const companyId = user?.company_id;
  if (!builderId) return { leadIds: [], jobIds: [] };

  const tenant = { builder_id: builderId, ...(companyId ? { company_id: companyId } : {}) };

  const [leads, jobs] = await Promise.all([
    db.Leads.findAll({ where: tenant, attributes: ["leads_id", "property_detail_id"] }),
    db.Job.findAll({ where: tenant, attributes: ["job_id"] }),
  ]);

  return {
    leadIds: leads.map((l) => l.leads_id),
    jobIds: jobs.map((j) => j.job_id),
    propertyDetailIds: uniq(leads.map((l) => l.property_detail_id)),
  };
};

/**
 * Expand the caller's leads + jobs into every `drive_files.reference_id` their
 * documents can carry.
 *
 * Files do not all hang off the lead/job id: quotation reports key on
 * quotation_version_id, floor plans and facades on the property detail,
 * variation PDFs on variation_id, invoices on job_invoice_id. Each hop is one
 * set-based query, never one per lead — so this stays flat for a builder with
 * hundreds of leads.
 */
export const collectBuilderReferenceIds = async (user) => {
  const { leadIds, jobIds, propertyDetailIds } = await getBuilderEntityIds(user);

  const referenceIds = new Set([...leadIds, ...jobIds, ...(propertyDetailIds || [])]);

  const [quotations, variations, jobInvoices] = await Promise.all([
    leadIds.length
      ? db.Quotation.findAll({
          where: { leads_id: { [Op.in]: leadIds } },
          attributes: ["quotation_id"],
          include: [
            { model: db.QuotationVersion, as: "versions", attributes: ["quotation_version_id"] },
          ],
        })
      : [],
    jobIds.length
      ? db.JobVariation.findAll({ where: { job_id: { [Op.in]: jobIds } }, attributes: ["variation_id"] })
      : [],
    jobIds.length
      ? db.JobInvoice.findAll({ where: { job_id: { [Op.in]: jobIds } }, attributes: ["job_invoice_id"] })
      : [],
  ]);

  for (const q of quotations) {
    for (const v of q.versions || []) referenceIds.add(v.quotation_version_id);
  }
  for (const v of variations) referenceIds.add(v.variation_id);
  for (const i of jobInvoices) referenceIds.add(i.job_invoice_id);

  return { leadIds, jobIds, referenceIds: [...referenceIds] };
};

/**
 * Every folder the user reaches through a folder share: the ones shared with
 * them directly, plus every folder nested underneath.
 *
 * Sharing a folder is meant to share what is inside it. Permission resolution
 * already understood that — it walks up the parent chain looking for an
 * inherited share — but the scope predicates only ever matched the shared
 * folder itself, so a restricted user could open a folder shared with them and
 * find it empty: its subfolders and files were filtered out of the listing one
 * layer below. Both predicates below now match the whole subtree.
 *
 * Walks down one level per query with the same depth guard the resolver uses,
 * and `paranoid: false` so a trashed branch still resolves for Trash actions.
 */
export const getSharedFolderTreeIds = async (user) => {
  const rootIds = await getSharedEntityIds(user, "FOLDER");
  if (rootIds.length === 0) return [];

  const companyId = user?.company_id;
  const all = new Set(rootIds);
  let frontier = rootIds;
  let depth = 0;

  while (frontier.length && depth < 50) {
    const children = await db.sequelize.models.Drive.findAll({
      where: {
        parent_id: { [Op.in]: frontier },
        // A sub-folder restored from Trash is cut off from the share on the
        // folder above it, so the share does not reach it or anything under it.
        inherit_shares: true,
        ...(companyId ? { company_id: companyId } : {}),
      },
      attributes: ["drive_id"],
      paranoid: false,
    });

    // Anything already collected is a cycle or a re-visit — stop following it.
    frontier = children.map((c) => c.drive_id).filter((id) => !all.has(id));
    frontier.forEach((id) => all.add(id));
    depth++;
  }

  return [...all];
};

/** Ids of drive entities explicitly shared with this user. */
export const getSharedEntityIds = async (user, entityType) => {
  const userId = user?.users_id;
  const companyId = user?.company_id;
  if (!userId) return [];

  const shares = await db.sequelize.models.DriveShare.findAll({
    where: {
      shared_with_user: userId,
      entity_type: entityType,
      ...(companyId ? { company_id: companyId } : {}),
    },
    attributes: ["entity_id"],
  });
  return uniq(shares.map((s) => s.entity_id));
};

/**
 * The `where` fragment restricting a DriveFile query to what this user may see.
 * Returns `null` for full-access roles, meaning "apply no extra filter".
 *
 * Callers MUST treat `null` as "no restriction" and anything else as a fragment
 * to AND into their existing where.
 *
 * `includeShares: false` narrows it to what the user reaches on their own —
 * their builder's lead/job paperwork, their own uploads, catalogue drawings —
 * with every share path removed. drive.permissions.js uses that variant to tell
 * "this is my own content" apart from "someone shared this with me", which is
 * what decides whether a role's implicit ADMIN applies or the share level does.
 */
export const buildFileScopeWhere = async (user, { includeShares = true } = {}) => {
  if (await hasFullDriveAccess(user)) return null;

  const builderId = user?.builder_id;
  const userId = user?.users_id;
  if (!builderId && !userId) return MATCH_NOTHING;

  const [{ leadIds, referenceIds }, sharedFileIds, sharedFolderIds] = await Promise.all([
    collectBuilderReferenceIds(user),
    includeShares ? getSharedEntityIds(user, "FILE") : [],
    includeShares ? getSharedFolderTreeIds(user) : [],
  ]);

  // What makes a file visible. Any one of these is enough.
  const visible = [];
  if (referenceIds.length) visible.push({ reference_id: { [Op.in]: referenceIds } });
  if (leadIds.length) visible.push({ lead_id: { [Op.in]: leadIds } });
  if (userId) visible.push({ uploaded_by: userId });
  if (sharedFileIds.length) visible.push({ file_id: { [Op.in]: sharedFileIds } });
  // Files sitting in a folder shared with them, at any depth — except one
  // restored from Trash, which the owner took back: the folder stays shared,
  // that file does not. A direct share on it (above) still counts, since
  // sharing it again is an explicit act.
  if (sharedFolderIds.length) {
    visible.push({ [Op.and]: [{ folder_id: { [Op.in]: sharedFolderIds } }, { inherit_shares: true }] });
  }
  visible.push({ reference_type: { [Op.in]: CATALOGUE_REFERENCE_TYPES } });

  // The builder predicate is ANDed on top, so even a shared or catalogue file
  // never crosses builders. Files with no builder stamped are treated as the
  // caller's only when they reached the list through one of the rules above.
  const tenant = builderId
    ? { [Op.or]: [{ builder_id: builderId }, { builder_id: null }] }
    : {};

  return { [Op.and]: [tenant, { [Op.or]: visible }] };
};

/**
 * The `where` fragment restricting a Drive (folder) query.
 *
 * Restricted roles do not browse the company folder tree at all — their S Drive
 * is the simplified My Leads / My Jobs / Shared structure. So a folder is
 * reachable only when they created it, it was shared with them, or it sits
 * inside a folder that was — sharing a folder shares what is nested in it.
 */
export const buildFolderScopeWhere = async (user, { includeShares = true } = {}) => {
  if (await hasFullDriveAccess(user)) return null;

  const userId = user?.users_id;
  if (!userId) return { [Op.and]: [{ drive_id: null }, { drive_id: { [Op.ne]: null } }] };

  const sharedFolderIds = includeShares ? await getSharedFolderTreeIds(user) : [];

  const visible = [{ created_by: userId }];
  if (sharedFolderIds.length) visible.push({ drive_id: { [Op.in]: sharedFolderIds } });

  return { [Op.or]: visible };
};

/**
 * Authoritative single-file check, used by every route that takes a file id
 * from the URL. Runs the same predicate as the listings, so a file the user
 * cannot list is also a file they cannot download, preview or version.
 *
 * `paranoid: false` so Trash actions (restore / download from trash) still
 * resolve for files the caller legitimately owns.
 */
export const canAccessFile = async (user, fileId) => {
  if (!fileId) return false;
  if (await hasFullDriveAccess(user)) {
    // Still tenant-bound: an admin may not reach another company's file.
    const file = await db.sequelize.models.DriveFile.findOne({
      where: { file_id: fileId, ...(user?.company_id ? { company_id: user.company_id } : {}) },
      attributes: ["file_id"],
      paranoid: false,
    });
    return Boolean(file);
  }

  const scope = await buildFileScopeWhere(user);
  const file = await db.sequelize.models.DriveFile.findOne({
    where: {
      [Op.and]: [
        { file_id: fileId },
        ...(user?.company_id ? [{ company_id: user.company_id }] : []),
        scope,
      ],
    },
    attributes: ["file_id"],
    paranoid: false,
  });
  return Boolean(file);
};

/** Authoritative single-folder check — same contract as canAccessFile. */
export const canAccessFolder = async (user, folderId) => {
  if (!folderId || folderId === "root") return true;
  if (await hasFullDriveAccess(user)) {
    const folder = await db.sequelize.models.Drive.findOne({
      where: { drive_id: folderId, ...(user?.company_id ? { company_id: user.company_id } : {}) },
      attributes: ["drive_id"],
      paranoid: false,
    });
    return Boolean(folder);
  }

  const scope = await buildFolderScopeWhere(user);
  const folder = await db.sequelize.models.Drive.findOne({
    where: {
      [Op.and]: [
        { drive_id: folderId },
        ...(user?.company_id ? [{ company_id: user.company_id }] : []),
        scope,
      ],
    },
    attributes: ["drive_id"],
    paranoid: false,
  });
  return Boolean(folder);
};

export default {
  hasFullDriveAccess,
  getBuilderEntityIds,
  collectBuilderReferenceIds,
  getSharedEntityIds,
  getSharedFolderTreeIds,
  buildFileScopeWhere,
  buildFolderScopeWhere,
  canAccessFile,
  canAccessFolder,
  CATALOGUE_REFERENCE_TYPES,
};
