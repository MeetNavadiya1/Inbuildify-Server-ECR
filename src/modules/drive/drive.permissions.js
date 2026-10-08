/**
 * Drive Permission Resolver
 *
 * Permission levels (ordered by access power) — these are the three levels the
 * Manage Access popup offers, and what each one buys:
 *
 *   VIEW   open, preview, download, star.
 *   EDIT   everything VIEW does, plus rename / move / restore and DELETE —
 *          someone shared at EDIT can send the shared item to Trash.
 *   ADMIN  everything EDIT does, plus Manage Access itself: share the item on
 *          to other users, change their level, and revoke it. Sharing back to
 *          the item's owner is still refused — they already hold full access.
 *
 * Inheritance rules:
 *   - Sharing a FOLDER grants access to all nested child folders and files.
 *   - A direct share on a child entity wins if it has a HIGHER permission level.
 *   - The item owner (created_by / uploaded_by) always has implicit ADMIN.
 */

import { Op } from "sequelize";
import db from "../../config/database/models/postgre-models/index.js";
import { errorResponse } from "../../helper/response.js";
import { ROLES } from "../../constants/rbac.js";
import { getRoleNameById } from "../../helper/rbac.helper.js";
import {
  hasFullDriveAccess,
  canAccessFile,
  canAccessFolder,
  buildFileScopeWhere,
  buildFolderScopeWhere,
} from "./drive.scope.js";

export const PERMISSION_RANK = { VIEW: 1, EDIT: 2, ADMIN: 3 };

/** True when `permission` is at least `minPermission` on the VIEW < EDIT < ADMIN scale. */
export const hasAtLeast = (permission, minPermission) =>
  (PERMISSION_RANK[permission] || 0) >= (PERMISSION_RANK[minPermission] || 1);

/**
 * Roles that administer the whole company drive, regardless of who uploaded
 * an item. Without this, only the uploader could delete their own files, while
 * the UI offers Delete / Empty Trash to every company admin — so admins hit a
 * 403 on anything they did not upload themselves.
 *
 * Builder is here because a Builder administers their own tenant's paperwork.
 * That implicit ADMIN is deliberately NOT applied to an item they only reach
 * because someone shared it with them — see resolvePermission step 5.
 */
const DRIVE_ADMIN_ROLES = new Set([
  ROLES.SUPER_ADMIN,
  ROLES.COMPANY_ADMINISTRATOR,
  ROLES.MH_COMPANY_ADMIN,
  ROLES.MY_HOME_COMPANY_ADMIN,
  ROLES.MY_HOME_ADMIN,
  ROLES.BUILDER,
]);

const isDriveAdminRole = async (user) => {
  const roleName = user?.role_name || (await getRoleNameById(user?.role_id));
  return Boolean(roleName && DRIVE_ADMIN_ROLES.has(roleName));
};

/**
 * Of `ids`, the ones this user reaches WITHOUT any share — their builder's
 * lead/job paperwork, their own uploads, folders they created.
 *
 * This is the line between "my own content" and "something shared with me". A
 * role's implicit ADMIN applies to the first; for the second the share's level
 * is the answer, otherwise a folder shared at VIEW with a Builder would come
 * back as ADMIN and they could re-share it — which is exactly what happened.
 *
 * One query per entity type, so it costs the same for a page as for one item.
 */
const filterOwnScopeIds = async (user, companyId, entityType, ids) => {
  const owned = new Set();
  if (!ids || ids.length === 0) return owned;

  const { Drive, DriveFile } = db.sequelize.models;
  const isFolder = entityType === "FOLDER";
  const scope = isFolder
    ? await buildFolderScopeWhere(user, { includeShares: false })
    : await buildFileScopeWhere(user, { includeShares: false });

  // null means "no restriction" — a full-access role, for whom the whole
  // company drive is their own scope.
  const idColumn = isFolder ? "drive_id" : "file_id";
  const rows = await (isFolder ? Drive : DriveFile).findAll({
    where: {
      [Op.and]: [
        { [idColumn]: ids },
        ...(companyId ? [{ company_id: companyId }] : []),
        ...(scope ? [scope] : []),
      ],
    },
    attributes: [idColumn],
    paranoid: false,
  });

  rows.forEach((row) => owned.add(row[idColumn]));
  return owned;
};

/**
 * Core resolver:
 * Determines the effective permission level a user has over a given entity.
 *
 * Algorithm:
 * 1. Owner of the item → ADMIN.
 * 2. Company-wide drive administrator → ADMIN (within their own company only).
 * 3. Check direct share on the entity.
 * 4. Walk up the folder tree; for each ancestor folder, check inherited shares.
 * 5. Keep the HIGHEST permission found. A Builder's implicit ADMIN still covers
 *    their own tenant's paperwork, but on an item they reach ONLY through a
 *    share, the share's level is the answer.
 * 6. No share found? Restricted roles must pass the drive-scope predicate —
 *    their own leads/jobs, their own uploads, or catalogue drawings.
 * 7. Return null if the item is out of the caller's company or out of scope.
 *    requireDrivePermission maps null to 403, so an id lifted from someone
 *    else's URL is rejected here rather than at the listing layer.
 */
export const resolvePermission = async (userId, companyId, entityType, entityId, user = null) => {
  const { Drive, DriveFile, DriveShare } = db.sequelize.models;

  // 1. Check ownership (implicit ADMIN)
  // paranoid: false throughout — items in Trash (and their soft-deleted ancestors)
  // must still resolve permissions so Trash actions like download/restore work.
  // The company_id filter below is what keeps this tenant-scoped, so the admin-role
  // check must come after it — never before.
  // inherit_shares === false means this item was restored from Trash and no
  // longer takes access from the folders above it — see the column's migration.
  let inheritsFromParents = true;
  if (entityType === "FOLDER") {
    const folder = await Drive.findOne({ where: { drive_id: entityId, company_id: companyId }, attributes: ["created_by", "parent_id", "inherit_shares"], paranoid: false });
    if (!folder) return null;
    if (folder.created_by === userId) return "ADMIN";
    inheritsFromParents = folder.inherit_shares !== false;
  } else {
    const file = await DriveFile.findOne({ where: { file_id: entityId, company_id: companyId }, attributes: ["uploaded_by", "folder_id", "inherit_shares"], paranoid: false });
    if (!file) return null;
    if (file.uploaded_by === userId) return "ADMIN";
    inheritsFromParents = file.inherit_shares !== false;
  }

  // 2. Company-wide drive administrators (Super Admin, the Company Admin
  //    variants) administer everything in their own company.
  if (user && (await hasFullDriveAccess(user))) return "ADMIN";

  let bestRank = 0;
  let bestPermission = null;

  // 3. Direct share on the entity
  const directShare = await DriveShare.findOne({
    where: { entity_type: entityType, entity_id: entityId, shared_with_user: userId, company_id: companyId }
  });
  if (directShare) {
    const rank = PERMISSION_RANK[directShare.permission_level] || 0;
    if (rank > bestRank) {
      bestRank = rank;
      bestPermission = directShare.permission_level;
    }
  }

  // 4. Walk up ancestor folder chain for inherited shares — unless this item
  //    was cut off from it, in which case only its own direct share counts.
  let currentFolderId = null;
  if (inheritsFromParents) {
    if (entityType === "FOLDER") {
      const folder = await Drive.findOne({ where: { drive_id: entityId, company_id: companyId }, attributes: ["parent_id"], paranoid: false });
      currentFolderId = folder?.parent_id;
    } else {
      const file = await DriveFile.findOne({ where: { file_id: entityId, company_id: companyId }, attributes: ["folder_id"], paranoid: false });
      currentFolderId = file?.folder_id;
    }
  }

  // Traverse up parent chain (max depth guard at 50 to prevent infinite loops)
  let depth = 0;
  while (currentFolderId && depth < 50) {
    const inheritedShare = await DriveShare.findOne({
      where: { entity_type: "FOLDER", entity_id: currentFolderId, shared_with_user: userId, company_id: companyId }
    });
    if (inheritedShare) {
      const rank = PERMISSION_RANK[inheritedShare.permission_level] || 0;
      if (rank > bestRank) {
        bestRank = rank;
        bestPermission = inheritedShare.permission_level;
      }
    }
    const parentFolder = await Drive.findOne({ where: { drive_id: currentFolderId }, attributes: ["parent_id", "inherit_shares"], paranoid: false });
    // A restored folder answers for its own subtree: its share still reaches
    // its children (handled above), but the chain stops there rather than
    // picking up the shares on whatever it happens to sit in.
    currentFolderId = parentFolder?.inherit_shares === false ? null : parentFolder?.parent_id;
    depth++;
  }

  // 5. An explicit share states the access level for that item, and it is
  //    authoritative: whoever chose VIEW in Manage Access meant VIEW, so a
  //    Builder's role-wide ADMIN does not quietly override it and let them
  //    delete or re-share what they were only given to read.
  //
  //    The owner (step 1) and the company-wide admins (step 2) are already
  //    past, so this caps nobody who administers the drive itself.
  if (bestPermission) return bestPermission;

  // 6. No share: a Builder still administers their own tenant's paperwork —
  //    their leads' and jobs' documents, their own uploads, the catalogue
  //    drawings — exactly as before.
  if (user && (await isDriveAdminRole(user))) {
    const ownScope = await filterOwnScopeIds(user, companyId, entityType, [entityId]);
    if (ownScope.has(entityId)) return "ADMIN";
  }

  // Neither shared nor their own content: fall through to the drive-scope
  // predicate. Full-access roles already returned ADMIN at step 2, so this is
  // the restricted-role path — the floor must not hand back VIEW on any id in
  // the company, which is exactly the direct-URL / id-manipulation hole.
  const permitted =
    entityType === "FOLDER"
      ? await canAccessFolder(user, entityId)
      : await canAccessFile(user, entityId);

  return permitted ? "VIEW" : null;
};

/**
 * The same answer as resolvePermission, for a whole page of listed items at once.
 *
 * The row menu has to know per item whether Delete (EDIT) and Manage Access
 * (ADMIN) apply, and calling resolvePermission per row would run four queries
 * per item plus one per ancestor. This resolves the page in a fixed number of
 * queries instead: owners in one query per model, the caller's shares in one,
 * and the folder tree only when the caller actually holds a folder share (with
 * no folder share there is nothing to inherit).
 *
 * Items are assumed to have come out of a scoped listing — drive.scope.js has
 * already dropped anything the caller may not see — so an item with no owner
 * and no share still resolves to the VIEW floor rather than null.
 *
 * @returns Map keyed "FOLDER:<id>" / "FILE:<id>" → "VIEW" | "EDIT" | "ADMIN".
 */
export const resolvePermissionsForItems = async (user, companyId, items) => {
  const { Drive, DriveFile, DriveShare } = db.sequelize.models;
  const permissions = new Map();
  if (!Array.isArray(items) || items.length === 0) return permissions;

  const identified = items.map(identifyEntity).filter((e) => e.id);
  if (identified.length === 0) return permissions;

  // Company-wide administrators administer the whole drive — nothing else to ask.
  if (await hasFullDriveAccess(user)) {
    for (const { type, id } of identified) permissions.set(`${type}:${id}`, "ADMIN");
    return permissions;
  }

  const userId = user?.users_id;
  const folderIds = [...new Set(identified.filter((e) => e.type === "FOLDER").map((e) => e.id))];
  const fileIds = [...new Set(identified.filter((e) => e.type === "FILE").map((e) => e.id))];

  const folderQuery = folderIds.length
    ? Drive.findAll({
      where: { drive_id: folderIds, company_id: companyId },
      attributes: ["drive_id", "created_by", "parent_id", "inherit_shares"],
      paranoid: false,
    })
    : [];
  const fileQuery = fileIds.length
    ? DriveFile.findAll({
      where: { file_id: fileIds, company_id: companyId },
      attributes: ["file_id", "uploaded_by", "folder_id", "inherit_shares"],
      paranoid: false,
    })
    : [];
  const shareQuery = userId
    ? DriveShare.findAll({
      where: { shared_with_user: userId, company_id: companyId },
      attributes: ["entity_type", "entity_id", "permission_level"],
    })
    : [];

  const [folderRows, fileRows, shares] = await Promise.all([folderQuery, fileQuery, shareQuery]);

  const ownerOf = new Map();
  const parentOf = new Map();
  // Items restored from Trash: they no longer take access from the folders
  // above them, so the ancestor walk below never starts for them.
  const inheritsOf = new Map();
  for (const f of folderRows) {
    ownerOf.set(`FOLDER:${f.drive_id}`, f.created_by);
    parentOf.set(`FOLDER:${f.drive_id}`, f.parent_id);
    inheritsOf.set(`FOLDER:${f.drive_id}`, f.inherit_shares !== false);
  }
  for (const f of fileRows) {
    ownerOf.set(`FILE:${f.file_id}`, f.uploaded_by);
    parentOf.set(`FILE:${f.file_id}`, f.folder_id);
    inheritsOf.set(`FILE:${f.file_id}`, f.inherit_shares !== false);
  }

  const shareOf = new Map();
  for (const s of shares) {
    const key = `${s.entity_type}:${s.entity_id}`;
    if ((PERMISSION_RANK[s.permission_level] || 0) > (PERMISSION_RANK[shareOf.get(key)] || 0)) {
      shareOf.set(key, s.permission_level);
    }
  }

  // Ancestor chain, loaded once. Only a FOLDER share can be inherited, so when
  // the caller holds none there is nothing to walk up to.
  const folderParent = new Map();
  const folderInherits = new Map();
  if (shares.some((s) => s.entity_type === "FOLDER")) {
    const tree = await Drive.findAll({
      where: { company_id: companyId },
      attributes: ["drive_id", "parent_id", "inherit_shares"],
      paranoid: false,
    });
    for (const f of tree) {
      folderParent.set(f.drive_id, f.parent_id);
      folderInherits.set(f.drive_id, f.inherit_shares !== false);
    }
  }

  // A Builder's implicit ADMIN covers their own tenant's content but not what
  // was merely shared with them — same rule as resolvePermission step 5,
  // resolved here in one query per entity type for the whole page.
  const builderAdmin = await isDriveAdminRole(user);
  const ownFolderIds = builderAdmin ? await filterOwnScopeIds(user, companyId, "FOLDER", folderIds) : new Set();
  const ownFileIds = builderAdmin ? await filterOwnScopeIds(user, companyId, "FILE", fileIds) : new Set();

  for (const { type, id } of identified) {
    const key = `${type}:${id}`;
    if (permissions.has(key)) continue;

    if (userId && ownerOf.get(key) === userId) {
      permissions.set(key, "ADMIN");
      continue;
    }

    let best = shareOf.get(key) || null;

    // Walk up from the item's parent folder, same depth guard as
    // resolvePermission — and, as there, not at all for an item restored from
    // Trash, whose access no longer comes from the folders above it.
    let currentFolderId = inheritsOf.get(key) === false ? null : parentOf.get(key);
    let depth = 0;
    while (currentFolderId && depth < 50 && best !== "ADMIN") {
      const inherited = shareOf.get(`FOLDER:${currentFolderId}`);
      if (inherited && (PERMISSION_RANK[inherited] || 0) > (PERMISSION_RANK[best] || 0)) {
        best = inherited;
      }
      // A restored folder's own share still reaches its children; the shares on
      // what it sits in do not.
      currentFolderId = folderInherits.get(currentFolderId) === false
        ? null
        : folderParent.get(currentFolderId);
      depth++;
    }

    // Same order as resolvePermission: an explicit share (direct or inherited
    // from a shared parent folder) is authoritative, and only then does a
    // Builder's role-wide ADMIN over their own tenant's paperwork apply.
    if (best) {
      permissions.set(key, best);
      continue;
    }

    if (builderAdmin && (type === "FOLDER" ? ownFolderIds : ownFileIds).has(id)) {
      permissions.set(key, "ADMIN");
      continue;
    }

    permissions.set(key, "VIEW");
  }

  return permissions;
};

/** "FOLDER" / "FILE" + id, from either a formatted listing row or a raw model row. */
const identifyEntity = (item) => {
  const plain = typeof item?.get === "function" ? item.get({ plain: true }) : item || {};
  const declared = plain.type ? String(plain.type).toUpperCase() : null;
  const type = declared === "FOLDER" || (!declared && plain.drive_id) ? "FOLDER" : "FILE";
  return { type, id: plain.id ?? plain.drive_id ?? plain.file_id ?? null, plain };
};

/**
 * Copy of `items` with the caller's effective permission stamped on each row.
 * The row menu reads it to decide which actions to offer; every one of those
 * actions is still checked server-side by requireDrivePermission.
 */
export const attachPermissions = async (user, companyId, items) => {
  if (!Array.isArray(items) || items.length === 0) return items ?? [];
  const permissions = await resolvePermissionsForItems(user, companyId, items);
  return items.map((item) => {
    const { type, id, plain } = identifyEntity(item);
    return { ...plain, permission: permissions.get(`${type}:${id}`) || "VIEW" };
  });
};

/**
 * Middleware factory — creates a guard that requires a minimum permission level.
 *
 * Usage in routes:
 *   router.delete("/folders/:id", authMiddleware, requireDrivePermission("EDIT"), controller.deleteFolder);
 *
 * It detects entityType and entityId from:
 *   - req.params.id
 *   - req.query.type  (FOLDER | FILE), defaults to FOLDER for /folders/* and FILE for /files/*
 */
export const requireDrivePermission = (minPermission) => {
  return async (req, res, next) => {
    try {
      const userId = req.user?.users_id;
      const companyId = req.user?.company_id;
      const entityId = req.params.id;

      if (!entityId || entityId === "root") return next(); // no permission check for root listing

      // Infer entity type from the route path
      const path = req.originalUrl || req.path;
      const entityType = path.includes("/files/") ? "FILE" : "FOLDER";

      const permission = await resolvePermission(userId, companyId, entityType, entityId, req.user);
      const userRank = PERMISSION_RANK[permission] || 0;
      const requiredRank = PERMISSION_RANK[minPermission] || 1;

      if (userRank < requiredRank) {
        return errorResponse(res, 403, `You need ${minPermission} permission to perform this action.`);
      }

      // Attach resolved permission to req for downstream use
      req.drivePermission = permission;
      return next();
    } catch (error) {
      console.error("[DrivePermission] Error resolving permission:", error);
      return errorResponse(res, 500, "Failed to verify permissions.");
    }
  };
};

// Pre-composed guards for convenience
export const canView = requireDrivePermission("VIEW");
export const canEdit = requireDrivePermission("EDIT");
export const canAdmin = requireDrivePermission("ADMIN");

/**
 * Does this user hold the item outright, ignoring every share?
 *
 * Deliberately not resolvePermission: a share at EDIT or ADMIN says nothing
 * here, because being given access to something is not owning it. True for
 *
 *   1. the item's own creator / uploader,
 *   2. a company-wide drive administrator, within their own company,
 *   3. a Builder over their own tenant's paperwork — their leads' and jobs'
 *      documents, the same rule resolvePermission applies at step 6,
 *   4. the owner of a folder above it. Documents are routinely filed with no
 *      uploader recorded (uploaded_by is nullable and several helpers leave it
 *      null), so without this an owner could not restore what they own — the
 *      same reasoning as the delete-request approver.
 */
export const isItemOwner = async (user, companyId, entityType, entityId) => {
  const { Drive, DriveFile } = db.sequelize.models;
  const userId = user?.users_id;
  if (!userId || !entityId) return false;

  let ownerId = null;
  let parentId = null;
  // paranoid: false — this decides a Trash action, so the row is soft-deleted.
  if (entityType === "FOLDER") {
    const folder = await Drive.findOne({
      where: { drive_id: entityId, company_id: companyId },
      attributes: ["created_by", "parent_id"],
      paranoid: false,
    });
    if (!folder) return false;
    ownerId = folder.created_by;
    parentId = folder.parent_id;
  } else {
    const file = await DriveFile.findOne({
      where: { file_id: entityId, company_id: companyId },
      attributes: ["uploaded_by", "folder_id"],
      paranoid: false,
    });
    if (!file) return false;
    ownerId = file.uploaded_by;
    parentId = file.folder_id;
  }

  if (ownerId && ownerId === userId) return true;
  // Checked after the lookup above, which is what keeps this tenant-bound.
  if (await hasFullDriveAccess(user)) return true;

  if (await isDriveAdminRole(user)) {
    const own = await filterOwnScopeIds(user, companyId, entityType, [entityId]);
    if (own.has(entityId)) return true;
  }

  const seen = new Set();
  let depth = 0;
  while (parentId && depth < 50 && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = await Drive.findOne({
      where: { drive_id: parentId, company_id: companyId },
      attributes: ["created_by", "parent_id"],
      paranoid: false,
    });
    if (!parent) return false;
    if (parent.created_by === userId) return true;
    parentId = parent.parent_id;
    depth++;
  }

  return false;
};

/**
 * Guard for actions only an owner may take on a deleted item — restoring it.
 *
 * Someone the item was shared with can ask for it to be deleted and, at EDIT,
 * delete it; bringing it back is the owner's decision alone. It is their Trash
 * it sits in (getTrashService lists no shared items) and their access list that
 * restoring wipes, so nobody else should be able to trigger it from an id.
 */
export const requireItemOwner = async (req, res, next) => {
  try {
    const entityId = req.params.id;
    if (!entityId || entityId === "root") return next();

    const path = req.originalUrl || req.path;
    const entityType = path.includes("/files/") ? "FILE" : "FOLDER";

    const owns = await isItemOwner(req.user, req.user?.company_id, entityType, entityId);
    if (!owns) {
      return errorResponse(res, 403, "Only the owner of this item can restore it.");
    }
    return next();
  } catch (error) {
    console.error("[DrivePermission] Error resolving ownership:", error);
    return errorResponse(res, 500, "Failed to verify permissions.");
  }
};
