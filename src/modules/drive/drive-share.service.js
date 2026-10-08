import db from "../../config/database/models/postgre-models/index.js";
import { resolvePermission, hasAtLeast } from "./drive.permissions.js";
import { getFolderSizeMap } from "./drive.service.js";

/**
 * Handing an item to someone else is the ADMIN level of the Manage Access
 * popup — VIEW opens it, EDIT can also delete it, and only ADMIN may share it
 * on, change a person's level, or revoke it. The item's owner and the company
 * admins resolve to ADMIN implicitly, so they always pass.
 */
const requireShareAdmin = async (userId, companyId, entityType, entityId, user) => {
  const permission = await resolvePermission(userId, companyId, entityType, entityId, user);
  if (!hasAtLeast(permission, "ADMIN")) {
    throw new Error("You need admin access on this item to manage who it is shared with.");
  }
  return permission;
};

/** A user's company — their own stamp, or the company their builder sits in. */
const resolveUserCompanyId = async (user, cache = null) => {
  if (user?.company_id) return user.company_id;

  const builderId = user?.builder_id;
  if (!builderId) return null;
  if (cache?.has(builderId)) return cache.get(builderId);

  const builder = await db.sequelize.models.Builder.findOne({
    where: { builder_id: builderId },
    attributes: ["company_id"],
  });
  const resolved = builder?.company_id ?? null;
  cache?.set(builderId, resolved);
  return resolved;
};

/**
 * Why this user may not receive the item — or null when they may.
 *
 * An item stamped with a builder can only be shared inside that builder: the
 * file scope predicate ANDs the same rule, so a cross-builder share would be a
 * row the recipient could never act on.
 *
 * An item with no builder stamp is company-level, and the company is its
 * boundary — it was already checked against the caller's company above. The
 * drive's own folders are created this way (no builder_id), so comparing that
 * null against the recipient's builder rejected *every* folder share with
 * "belong to different builders", which is why nothing could be shared at all.
 */
const tenantMismatchReason = async (targetUser, entityBuilderId, companyId, cache = null) => {
  if (entityBuilderId) {
    return targetUser.builder_id === entityBuilderId ? null : "They belong to a different builder.";
  }

  const targetCompanyId = await resolveUserCompanyId(targetUser, cache);
  if (!targetCompanyId) return "Their company could not be determined.";
  return targetCompanyId === companyId ? null : "They belong to a different company.";
};

/**
 * Everyone who handed `userId` access to this entity — the sharer on the entity
 * itself, plus the sharer on every ancestor folder it inherits access from.
 *
 * Sharing an item back to one of them is a no-op: they already hold at least the
 * access they gave away, so the only effect of the new row would be the item
 * reappearing in *their* "Shared with me" list, attributed to the person they
 * shared it with in the first place. Both share paths skip them.
 *
 * Walks the same ancestor chain as resolvePermission, with the same depth guard.
 */
const getGrantorIds = async (userId, companyId, entityType, entityId, parentFolderId) => {
  const { DriveShare, Drive } = db.sequelize.models;
  const grantors = new Set();

  const direct = await DriveShare.findAll({
    where: { entity_type: entityType, entity_id: entityId, shared_with_user: userId, company_id: companyId },
    attributes: ["shared_by"],
  });
  direct.forEach((s) => grantors.add(s.shared_by));

  let currentFolderId = parentFolderId;
  let depth = 0;
  while (currentFolderId && depth < 50) {
    const inherited = await DriveShare.findAll({
      where: { entity_type: "FOLDER", entity_id: currentFolderId, shared_with_user: userId, company_id: companyId },
      attributes: ["shared_by"],
    });
    inherited.forEach((s) => grantors.add(s.shared_by));

    const parent = await Drive.findOne({ where: { drive_id: currentFolderId }, attributes: ["parent_id"], paranoid: false });
    currentFolderId = parent?.parent_id;
    depth++;
  }

  return grantors;
};

/**
 * Create a new share record.
 *
 * Guards:
 * - Requires ADMIN on the item — only that level may hand it to someone else
 * - Prevents cross-company sharing (sharedWith user must belong to same company)
 * - Prevents duplicate share rows (unique_share_per_user_entity DB constraint + early check)
 * - Prevents the owner from being downgraded (they always have implicit ADMIN)
 * - Prevents sharing back to the owner or to whoever shared the item with you
 */
export const createShareService = async (
  { entity_type, entity_id, shared_with_user, permission_level },
  sharedBy,
  companyId,
  requestingUser = null,
) => {
  const { DriveShare, Drive, DriveFile } = db.sequelize.models;
  const entityTypeUpper = entity_type.toUpperCase();

  // 1. Resolve ownership — owner always has ADMIN, block sharing to self
  if (shared_with_user === sharedBy) {
    throw new Error("You cannot share an item with yourself.");
  }

  // 2. Verify entity exists and belongs to this company
  let entityBuilderId = null;
  let entityOwnerId = null;
  let entityParentId = null;
  if (entityTypeUpper === "FOLDER") {
    const folder = await Drive.findOne({ where: { drive_id: entity_id } });
    if (!folder) throw new Error(`Folder with ID ${entity_id} not found.`);
    if (folder.company_id !== companyId) throw new Error("This folder belongs to a different company.");
    entityBuilderId = folder.builder_id;
    entityOwnerId = folder.created_by;
    entityParentId = folder.parent_id;
  } else {
    const file = await DriveFile.findOne({ where: { file_id: entity_id } });
    if (!file) throw new Error(`File with ID ${entity_id} not found.`);
    if (file.company_id !== companyId) throw new Error("This file belongs to a different company.");
    entityBuilderId = file.builder_id;
    entityOwnerId = file.uploaded_by;
    entityParentId = file.folder_id;
  }

  // 2a. Only an ADMIN on the item may share it on. Checked after the entity is
  //     loaded so a wrong id still reports "not found" rather than a 403.
  await requireShareAdmin(sharedBy, companyId, entityTypeUpper, entity_id, requestingUser);

  // 2b. The owner holds implicit ADMIN and whoever shared this with the caller
  //     already has it — a row pointing back at either only echoes the item into
  //     their own "Shared with me" list.
  if (shared_with_user === entityOwnerId) {
    throw new Error("This user owns the item and already has full access.");
  }
  const grantorIds = await getGrantorIds(sharedBy, companyId, entityTypeUpper, entity_id, entityParentId);
  if (grantorIds.has(shared_with_user)) {
    throw new Error("This user shared the item with you — they already have access.");
  }

  // 3. Cross-tenant guard — the recipient must sit inside the item's builder,
  //    or inside its company when the item carries no builder stamp.
  const Users = db.sequelize.model("Users");
  const targetUser = await Users.findOne({ where: { users_id: shared_with_user } });

  if (!targetUser) {
    throw new Error(`Target user with ID ${shared_with_user} not found.`);
  }

  const mismatch = await tenantMismatchReason(targetUser, entityBuilderId, companyId);
  if (mismatch) {
    throw new Error(`You cannot share this item with ${targetUser.name || "that user"}. ${mismatch}`);
  }

  // 4. Duplicate check
  const existing = await DriveShare.findOne({
    where: { entity_type: entityTypeUpper, entity_id, shared_with_user, company_id: companyId }
  });
  if (existing) {
    throw new Error("This item is already shared with that user. Use update to change permissions.");
  }

  const share = await DriveShare.create({
    entity_type: entityTypeUpper,
    entity_id,
    shared_by: sharedBy,
    shared_with_user,
    permission_level,
    company_id: companyId,
  });

  return share;
};

/**
 * Share one entity with several users in a single call — what the Share popup
 * posts.
 *
 * Differs from createShareService in three ways that matter at N users:
 * - The entity and the sharer's permission are resolved ONCE, not per user.
 * - One user failing (already shared, wrong builder, is the sharer, owns the
 *   item, or is the person who shared it with the caller) does not abort the
 *   rest; each target gets its own result row so the UI can report "shared with
 *   3, skipped 1" rather than failing the whole batch.
 * - Sharing requires ADMIN on the item, so neither an ordinary member on the
 *   company-wide VIEW fallback nor an EDIT grantee can re-share someone else's
 *   file. Owners and company admins resolve to ADMIN, so they always pass.
 */
export const createBulkShareService = async (
  { entity_type, entity_id, shared_with_users, permission_level = "VIEW" },
  sharedBy,
  companyId,
  requestingUser = null,
) => {
  const { DriveShare, Drive, DriveFile, Users } = db.sequelize.models;
  const entityTypeUpper = entity_type.toUpperCase();

  // 1. Resolve the entity once, and confirm it is in the caller's company.
  let entityBuilderId = null;
  let entityName = null;
  let entityOwnerId = null;
  let entityParentId = null;
  if (entityTypeUpper === "FOLDER") {
    const folder = await Drive.findOne({ where: { drive_id: entity_id } });
    if (!folder) throw new Error(`Folder with ID ${entity_id} not found.`);
    if (folder.company_id !== companyId) throw new Error("This folder belongs to a different company.");
    entityBuilderId = folder.builder_id;
    entityName = folder.name;
    entityOwnerId = folder.created_by;
    entityParentId = folder.parent_id;
  } else {
    const file = await DriveFile.findOne({ where: { file_id: entity_id } });
    if (!file) throw new Error(`File with ID ${entity_id} not found.`);
    if (file.company_id !== companyId) throw new Error("This file belongs to a different company.");
    entityBuilderId = file.builder_id;
    entityName = file.original_name;
    entityOwnerId = file.uploaded_by;
    entityParentId = file.folder_id;
  }

  // 2. Only an ADMIN on the item may hand it to other people.
  await requireShareAdmin(sharedBy, companyId, entityTypeUpper, entity_id, requestingUser);

  // 3. De-duplicate the incoming list and drop the sharer — sharing with
  //    yourself is a no-op, not an error worth failing the batch over.
  const targets = [...new Set(shared_with_users)].filter((id) => id !== sharedBy);
  if (targets.length === 0) {
    throw new Error("Select at least one other user to share with.");
  }

  // 4. Fetch every target user and every pre-existing share in one query each.
  const users = await Users.findAll({ where: { users_id: targets } });
  const usersById = new Map(users.map((u) => [u.users_id, u]));

  const existingShares = await DriveShare.findAll({
    where: { entity_type: entityTypeUpper, entity_id, shared_with_user: targets, company_id: companyId },
  });
  const existingByUser = new Map(existingShares.map((s) => [s.shared_with_user, s]));

  // 5. Who already has this item without a row of their own: its owner, and
  //    whoever shared it with the caller. Resolved once for the whole batch.
  const grantorIds = await getGrantorIds(sharedBy, companyId, entityTypeUpper, entity_id, entityParentId);

  const shared = [];
  const skipped = [];
  const toCreate = [];
  // Builder → company lookups are shared across the batch; targets usually sit
  // in a handful of builders, so this is a couple of queries, not one per user.
  const companyOfBuilder = new Map();

  for (const userId of targets) {
    const user = usersById.get(userId);
    if (!user) {
      skipped.push({ user_id: userId, reason: "User not found." });
      continue;
    }
    const mismatch = await tenantMismatchReason(user, entityBuilderId, companyId, companyOfBuilder);
    if (mismatch) {
      skipped.push({ user_id: userId, reason: mismatch });
      continue;
    }
    if (userId === entityOwnerId) {
      skipped.push({ user_id: userId, reason: "They own this item and already have full access." });
      continue;
    }
    if (grantorIds.has(userId)) {
      skipped.push({ user_id: userId, reason: "They shared this item with you — they already have access." });
      continue;
    }
    // Re-sharing at a different level is an update, not a duplicate-key error.
    const existing = existingByUser.get(userId);
    if (existing) {
      if (existing.permission_level !== permission_level) {
        existing.permission_level = permission_level;
        await existing.save();
        shared.push(existing);
      } else {
        skipped.push({ user_id: userId, reason: "Already shared with this user." });
      }
      continue;
    }
    toCreate.push({
      entity_type: entityTypeUpper,
      entity_id,
      shared_by: sharedBy,
      shared_with_user: userId,
      permission_level,
      company_id: companyId,
    });
  }

  if (toCreate.length > 0) {
    const created = await DriveShare.bulkCreate(toCreate, { returning: true });
    shared.push(...created);
  }

  return {
    entity_type: entityTypeUpper,
    entity_id,
    entity_name: entityName,
    permission_level,
    shared_count: shared.length,
    skipped_count: skipped.length,
    shares: shared,
    skipped,
  };
};

/**
 * Update the permission_level on an existing share — moving someone between
 * View / Edit / Admin from the Manage Access list.
 *
 * Allowed for the person who created the share and for anyone holding ADMIN on
 * the item (its owner, a company admin, or a user shared in at ADMIN). Without
 * the second case an ADMIN grantee could add people but never correct them.
 *
 * Nobody edits the row that grants their own access: an ADMIN whose own level
 * came from a folder share would otherwise be able to rewrite it, and the list
 * should show one person changing another's access, not their own.
 */
export const updateShareService = async (shareId, permission_level, requestingUserId, companyId, requestingUser = null) => {
  const { DriveShare } = db.sequelize.models;

  const share = await DriveShare.findOne({ where: { share_id: shareId, company_id: companyId } });
  if (!share) throw new Error("Share record not found.");

  if (share.shared_with_user === requestingUserId) {
    throw new Error("You cannot change your own access to this item.");
  }

  if (share.shared_by !== requestingUserId) {
    await requireShareAdmin(requestingUserId, companyId, share.entity_type, share.entity_id, requestingUser);
  }

  share.permission_level = permission_level;
  await share.save();
  return share;
};

/**
 * Revoke a share.
 *
 * Same rule as updateShareService — the original sharer or an ADMIN on the item
 * — with one addition: a person may always remove their own access, which is
 * what "Remove me" on a shared item means.
 */
export const deleteShareService = async (shareId, requestingUserId, companyId, requestingUser = null) => {
  const { DriveShare } = db.sequelize.models;

  const share = await DriveShare.findOne({ where: { share_id: shareId, company_id: companyId } });
  if (!share) throw new Error("Share record not found.");

  const isOwnAccess = share.shared_with_user === requestingUserId;
  if (!isOwnAccess && share.shared_by !== requestingUserId) {
    await requireShareAdmin(requestingUserId, companyId, share.entity_type, share.entity_id, requestingUser);
  }

  await share.destroy();
};

/**
 * Get all items shared directly with the requesting user.
 * Enriches each share record with entity metadata (name, type).
 * Handles share inheritance display: groups by entity with effective permission.
 */
export const getSharedWithMeService = async (userId, companyId) => {
  const { DriveShare, Drive, DriveFile, Users } = db.sequelize.models;

  const shares = await DriveShare.findAll({
    where: { shared_with_user: userId, company_id: companyId },
    order: [["created_at", "DESC"]],
  });
  if (shares.length === 0) return { items: [] };

  // Resolve the three sides of the list — folders, files, sharers — in one
  // query each rather than three per row.
  const folderIds = shares.filter((s) => s.entity_type === "FOLDER").map((s) => s.entity_id);
  const fileIds = shares.filter((s) => s.entity_type !== "FOLDER").map((s) => s.entity_id);

  const [folders, files, sharers] = await Promise.all([
    folderIds.length
      ? Drive.findAll({
          where: { drive_id: folderIds, company_id: companyId },
          attributes: ["drive_id", "name", "parent_id", "is_starred", "created_at", "updated_at"],
        })
      : [],
    fileIds.length
      ? DriveFile.findAll({
          where: { file_id: fileIds, company_id: companyId },
          attributes: [
            "file_id", "original_name", "folder_id", "file_extension",
            "size", "mime_type", "s3_key", "is_starred", "created_at", "updated_at",
          ],
        })
      : [],
    Users.findAll({
      where: { users_id: [...new Set(shares.map((s) => s.shared_by))] },
      attributes: ["users_id", "name"],
    }),
  ]);

  const folderById = new Map(folders.map((f) => [f.drive_id, f]));
  const fileById = new Map(files.map((f) => [f.file_id, f]));
  const sharerById = new Map(sharers.map((u) => [u.users_id, u.name]));

  // A shared folder shows the same size as it does in My Drive — everything
  // inside it, however deep. Without this the Shared list rendered a bare "—".
  const folderSizes = folders.length ? await getFolderSizeMap(companyId, null) : new Map();

  // Both models are paranoid, so an entity that has since been trashed simply
  // won't be in the map — drop that share rather than emit a nameless ghost row.
  const items = [];
  for (const share of shares) {
    const isFolder = share.entity_type === "FOLDER";
    const entity = isFolder ? folderById.get(share.entity_id) : fileById.get(share.entity_id);
    if (!entity) continue;

    items.push({
      // `id` / `type` / `name` are what the drive explorer keys every row on;
      // the entity_* aliases stay for existing consumers of this endpoint.
      id: share.entity_id,
      type: isFolder ? "folder" : "file",
      name: isFolder ? entity.name : entity.original_name,
      parent_id: isFolder ? entity.parent_id : entity.folder_id,
      file_extension: isFolder ? null : entity.file_extension,
      size: isFolder ? folderSizes.get(entity.drive_id) ?? 0 : entity.size,
      mime_type: isFolder ? null : entity.mime_type,
      s3_key: isFolder ? null : entity.s3_key,
      is_starred: entity.is_starred ?? false,
      created_at: entity.created_at,
      updated_at: entity.updated_at,

      share_id: share.share_id,
      entity_type: share.entity_type,
      entity_id: share.entity_id,
      entity_name: isFolder ? entity.name : entity.original_name,
      permission_level: share.permission_level,
      shared_by: share.shared_by,
      shared_by_name: sharerById.get(share.shared_by) ?? null,
      shared_at: share.created_at,
    });
  }

  return { items };
};

/**
 * Everything the Manage Access popup renders for one item: who it is shared
 * with and at what level, who owns it, and what the caller may do here.
 *
 * `can_manage` is the ADMIN answer — the popup shows the add-people row and the
 * per-person level/remove controls only when it is true, and every one of those
 * calls is checked again server-side.
 */
export const getEntitySharesService = async (entity_type, entity_id, companyId, requestingUserId = null, requestingUser = null) => {
  const { DriveShare, Drive, DriveFile, Users } = db.sequelize.models;

  // The route accepts the plural path segment ("folders" / "files"); shares are
  // stored against the singular upper-case type.
  const entityTypeUpper = entity_type.toUpperCase().startsWith("FOLDER") ? "FOLDER" : "FILE";

  const shares = await DriveShare.findAll({
    where: { entity_type: entityTypeUpper, entity_id, company_id: companyId },
    order: [["created_at", "ASC"]],
  });

  let ownerId = null;
  if (entityTypeUpper === "FOLDER") {
    const folder = await Drive.findOne({ where: { drive_id: entity_id, company_id: companyId }, attributes: ["created_by"], paranoid: false });
    ownerId = folder?.created_by ?? null;
  } else {
    const file = await DriveFile.findOne({ where: { file_id: entity_id, company_id: companyId }, attributes: ["uploaded_by"], paranoid: false });
    ownerId = file?.uploaded_by ?? null;
  }

  // One lookup for every name the popup shows — the people on the list, whoever
  // shared with them, and the owner.
  const userIds = [...new Set([
    ...shares.map((s) => s.shared_with_user),
    ...shares.map((s) => s.shared_by),
    ownerId,
  ].filter(Boolean))];

  const users = userIds.length
    ? await Users.findAll({ where: { users_id: userIds }, attributes: ["users_id", "name", "email"] })
    : [];
  const userById = new Map(users.map((u) => [u.users_id, u]));

  const myPermission = requestingUserId
    ? await resolvePermission(requestingUserId, companyId, entityTypeUpper, entity_id, requestingUser)
    : null;

  const items = shares.map((s) => ({
    share_id: s.share_id,
    entity_type: s.entity_type,
    entity_id: s.entity_id,
    permission_level: s.permission_level,
    shared_by: s.shared_by,
    shared_by_name: userById.get(s.shared_by)?.name ?? null,
    shared_with_user: s.shared_with_user,
    shared_with_name: userById.get(s.shared_with_user)?.name ?? null,
    shared_with_email: userById.get(s.shared_with_user)?.email ?? null,
    created_at: s.created_at,
  }));

  return {
    items,
    entity_type: entityTypeUpper,
    entity_id,
    owner_id: ownerId,
    owner_name: ownerId ? userById.get(ownerId)?.name ?? null : null,
    is_owner: Boolean(ownerId && ownerId === requestingUserId),
    my_permission: myPermission,
    can_manage: hasAtLeast(myPermission, "ADMIN"),
  };
};
