/**
 * Delete approval for shared drive items.
 *
 * Someone the item was shared with at EDIT or ADMIN cannot delete it outright.
 * They raise a request here; the owner is emailed a tokenised review link, and
 * only their approval sends the item to Trash. The requester is emailed the
 * outcome either way.
 *
 * The owner and the company-wide drive administrators are deliberately NOT
 * routed through this — they already hold the item outright, and their Delete
 * stays the direct one it has always been.
 */

import db from "../../config/database/models/postgre-models/index.js";
import { env } from "../../config/env.config.js";
import sendEmail from "../../service/sendMail.service.js";
import { resolvePermission, hasAtLeast } from "./drive.permissions.js";
import { deleteFolderService, deleteFileService } from "./drive.service.js";
import {
  wrapDriveDeleteRequestHTML,
  wrapDriveDeleteDecisionHTML,
} from "../../templates/drive-delete-request.template.js";

export const DELETE_REQUEST_STATUS = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
};

/** "folder" / "file" (what the API speaks) → "FOLDER" / "FILE" (what we store). */
const toEntityType = (value) =>
  String(value || "").toUpperCase().startsWith("FOLDER") ? "FOLDER" : "FILE";

/**
 * The item, its owner and its name — the three things every path here needs,
 * read from whichever of the two tables holds it.
 *
 * paranoid: false so a request raised on an item the owner has since trashed
 * still resolves; respond() checks `deleted_at` rather than failing to find it.
 */
const loadEntity = async (entityType, entityId, companyId) => {
  const { Drive, DriveFile } = db.sequelize.models;

  if (entityType === "FOLDER") {
    const folder = await Drive.findOne({
      where: { drive_id: entityId, company_id: companyId },
      attributes: ["drive_id", "name", "parent_id", "created_by", "deleted_at"],
      paranoid: false,
    });
    if (!folder) return null;
    return {
      id: folder.drive_id,
      name: folder.name,
      parentId: folder.parent_id,
      ownerId: folder.created_by,
      deletedAt: folder.deleted_at,
    };
  }

  const file = await DriveFile.findOne({
    where: { file_id: entityId, company_id: companyId },
    attributes: ["file_id", "original_name", "folder_id", "uploaded_by", "deleted_at"],
    paranoid: false,
  });
  if (!file) return null;
  return {
    id: file.file_id,
    name: file.original_name,
    parentId: file.folder_id,
    ownerId: file.uploaded_by,
    deletedAt: file.deleted_at,
  };
};

/** Name of the folder an item sits in, for the "Location" line of the email. */
const parentFolderName = async (parentId, companyId) => {
  if (!parentId) return null;
  const { Drive } = db.sequelize.models;
  const parent = await Drive.findOne({
    where: { drive_id: parentId, company_id: companyId },
    attributes: ["name"],
    paranoid: false,
  });
  return parent?.name ?? null;
};

const findUser = async (userId) => {
  if (!userId) return null;
  const { Users } = db.sequelize.models;
  return Users.findOne({
    where: { users_id: userId },
    attributes: ["users_id", "name", "email"],
  });
};

/**
 * Who is asked to approve this deletion.
 *
 * The item's own owner when it has a reachable one — but `uploaded_by` and
 * `created_by` are both nullable, and the document helpers that file paperwork
 * into the drive write `uploaded_by: null` routinely. A file dropped inside a
 * shared folder therefore often has no owner of its own, which used to fail the
 * request outright with "no email address on file".
 *
 * So the search climbs the folder tree: whoever owns the folder an item sits in
 * owns what is inside it, which is how a shared folder reads to the people it
 * was shared with. It keeps climbing past any ancestor whose owner is missing
 * or has no email, because an approver who cannot be emailed cannot approve.
 *
 * @returns {Promise<{user: object, viaFolder: string|null}|null>} who to ask,
 *          and the folder they own it through when it is not the item itself —
 *          the email says which, so nobody is asked about something they do not
 *          recognise as theirs. Null when the whole chain up to the drive root
 *          yields nobody contactable.
 */
const resolveApprover = async (entity, companyId) => {
  const seenFolders = new Set();
  let candidateId = entity.ownerId;
  let parentId = entity.parentId;
  let viaFolder = null;

  // Same depth guard as resolvePermission's ancestor walk.
  for (let depth = 0; depth <= 50; depth++) {
    const candidate = await findUser(candidateId);
    if (candidate?.email) return { user: candidate, viaFolder };

    if (!parentId || seenFolders.has(parentId)) return null;
    seenFolders.add(parentId);

    const parent = await loadEntity("FOLDER", parentId, companyId);
    if (!parent) return null;
    candidateId = parent.ownerId;
    parentId = parent.parentId;
    viaFolder = parent.name;
  }
  return null;
};

/**
 * Raise a request to delete an item somebody shared with you.
 *
 * Works on anything inside a shared folder, not just the folder itself: the
 * EDIT a folder share grants reaches every file under it, and resolveApprover
 * finds the owner to ask even when the file itself has none recorded.
 *
 * Rejected outright when: the item is not yours to ask about (below EDIT), you
 * already own it (delete it directly instead), or a request on it is already
 * waiting — a second email would only give the owner two of the same decision.
 */
export const createDeleteRequestService = async (payload, user) => {
  const { DriveDeleteRequest } = db.sequelize.models;

  const companyId = user?.company_id;
  const userId = user?.users_id;
  const entityType = toEntityType(payload?.entity_type);
  const entityId = payload?.entity_id;
  const reason = payload?.reason ? String(payload.reason).trim().slice(0, 2000) : null;

  const entity = await loadEntity(entityType, entityId, companyId);
  if (!entity || entity.deletedAt) {
    throw new Error("Item not found.");
  }

  if (entity.ownerId && entity.ownerId === userId) {
    throw new Error("You own this item — you can delete it directly.");
  }

  // The same EDIT bar the direct delete route enforces: VIEW is not enough to
  // ask for a deletion, only to read the item.
  const permission = await resolvePermission(userId, companyId, entityType, entityId, user);
  if (!hasAtLeast(permission, "EDIT")) {
    throw new Error("You need EDIT permission on this item to request its deletion.");
  }

  const pending = await DriveDeleteRequest.findOne({
    where: {
      entity_type: entityType,
      entity_id: entityId,
      company_id: companyId,
      status: DELETE_REQUEST_STATUS.PENDING,
    },
  });
  if (pending) {
    throw new Error("A delete request for this item is already waiting for the owner's approval.");
  }

  // The item's own owner, or — for anything filed into a shared folder without
  // one — whoever owns the folder it sits in. See resolveApprover.
  const approver = await resolveApprover(entity, companyId);
  if (!approver) {
    throw new Error(
      "Nobody with an email address owns this item or the folders above it, so the request cannot be sent. Ask a company administrator to delete it.",
    );
  }
  const owner = approver.user;
  if (owner.users_id === userId) {
    throw new Error("You own the folder this item sits in, so there is nobody to ask — delete it directly.");
  }

  const request = await DriveDeleteRequest.create({
    company_id: companyId,
    entity_type: entityType,
    entity_id: entityId,
    entity_name: entity.name,
    reason,
    requested_by: userId ?? null,
    owner_id: owner.users_id,
    owner_email: owner.email,
    status: DELETE_REQUEST_STATUS.PENDING,
    sent_at: new Date(),
  });

  // A failed send must not leave the requester thinking the owner was asked.
  try {
    await emailOwner({
      request,
      owner,
      requestedByName: user?.name,
      itemType: entityType === "FOLDER" ? "folder" : "file",
      location: await parentFolderName(entity.parentId, companyId),
      // Set when they own it through a folder rather than the item itself.
      ownedViaFolder: approver.viaFolder,
    });
  } catch (error) {
    console.error("[DriveDeleteRequest] Failed to email the owner:", error);
    await request.destroy();
    throw new Error("Could not email the owner for approval. Please try again.");
  }

  return {
    drive_delete_request_id: request.drive_delete_request_id,
    entity_type: entityType,
    entity_id: entityId,
    entity_name: entity.name,
    status: request.status,
    owner_name: owner.name ?? null,
    sent_at: request.sent_at,
  };
};

/** Compose and queue the approval email for the owner. */
async function emailOwner({ request, owner, requestedByName, itemType, location, ownedViaFolder }) {
  const reviewUrl = env.EMAIL?.FRONTEND_BASE_URL
    ? `${env.EMAIL.FRONTEND_BASE_URL}/external?Type=drivedelete&id=${request.drive_delete_request_id}&token=${request.access_token}`
    : "#";

  const { subject, html, text } = wrapDriveDeleteRequestHTML({
    ownerName: owner.name,
    requestedByName,
    itemName: request.entity_name,
    itemType,
    sharedFolderName: location,
    ownedViaFolder,
    reason: request.reason,
    requestedAt: request.sent_at,
    reviewUrl,
  });

  await sendEmail(owner.email, subject, text, html);
}

/**
 * The owner's view, reached from the emailed link. Token-secured, so it exposes
 * only what the decision needs — no ids, no drive structure beyond the item's
 * own name and where it sits.
 */
export const getDeleteRequestPublicDetailsService = async (requestId, token) => {
  const { DriveDeleteRequest, Users } = db.sequelize.models;

  const request = await DriveDeleteRequest.findOne({
    where: { drive_delete_request_id: requestId },
    include: [
      { model: Users, as: "requestedByUser", attributes: ["name"], required: false },
      { model: Users, as: "ownerUser", attributes: ["name"], required: false },
    ],
  });

  if (!request || String(request.access_token) !== String(token || "")) {
    throw new Error("This link is not valid. It may have been superseded by a newer email.");
  }

  const entity = await loadEntity(request.entity_type, request.entity_id, request.company_id);

  return {
    drive_delete_request_id: request.drive_delete_request_id,
    status: request.status,
    item_name: entity?.name ?? request.entity_name,
    item_type: request.entity_type === "FOLDER" ? "folder" : "file",
    location: await parentFolderName(entity?.parentId, request.company_id),
    reason: request.reason,
    requested_by: request.requestedByUser?.name ?? null,
    owner_name: request.ownerUser?.name ?? null,
    requested_at: request.sent_at,
    responded_at: request.responded_at,
    response_comments: request.response_comments,
    // The owner may have trashed it themselves in the meantime; the page says
    // so rather than offering an approval that would purge it for good.
    already_deleted: Boolean(entity?.deletedAt) || !entity,
  };
};

/**
 * Record the owner's decision.
 *
 * Approving performs the deletion the requester asked for — a soft delete, so
 * the item lands in Trash and the owner can still restore it. Guarded against a
 * second response: whoever clicks first settles it, and a later click on the
 * same link is told so.
 *
 * An item already in Trash is NOT deleted again: deleteFolderService and
 * deleteFileService purge a row that is already soft-deleted, which would turn
 * this approval into a permanent erase the owner never agreed to.
 */
export const respondToDeleteRequestService = async (requestId, input = {}) => {
  const { DriveDeleteRequest, Users } = db.sequelize.models;

  const decision = String(input.decision || "").toUpperCase();
  if (![DELETE_REQUEST_STATUS.APPROVED, DELETE_REQUEST_STATUS.REJECTED].includes(decision)) {
    throw new Error("Decision must be APPROVED or REJECTED.");
  }

  const request = await DriveDeleteRequest.findOne({
    where: { drive_delete_request_id: requestId },
    include: [
      { model: Users, as: "requestedByUser", attributes: ["name", "email"], required: false },
      { model: Users, as: "ownerUser", attributes: ["name"], required: false },
    ],
  });

  if (!request || String(request.access_token) !== String(input.token || "")) {
    throw new Error("This link is not valid. It may have been superseded by a newer email.");
  }
  if (request.status !== DELETE_REQUEST_STATUS.PENDING) {
    throw new Error(`This request has already been ${request.status.toLowerCase()}.`);
  }

  const entity = await loadEntity(request.entity_type, request.entity_id, request.company_id);

  if (decision === DELETE_REQUEST_STATUS.APPROVED && entity && !entity.deletedAt) {
    if (request.entity_type === "FOLDER") {
      await deleteFolderService(request.entity_id, request.company_id);
    } else {
      await deleteFileService(request.entity_id, request.company_id, request.owner_id);
    }
  }

  await request.update({
    status: decision,
    response_comments: input.comments ? String(input.comments).slice(0, 1000) : null,
    responded_by_email: input.responded_by_email || request.owner_email || null,
    responded_at: new Date(),
  });

  // Best effort: the decision is recorded either way, and a bounced courtesy
  // email must not read back to the owner as a failed approval.
  try {
    if (request.requestedByUser?.email) {
      const { subject, html, text } = wrapDriveDeleteDecisionHTML({
        requestedByName: request.requestedByUser.name,
        ownerName: request.ownerUser?.name,
        itemName: entity?.name ?? request.entity_name,
        itemType: request.entity_type === "FOLDER" ? "folder" : "file",
        decision,
        comments: request.response_comments,
        decidedAt: request.responded_at,
      });
      await sendEmail(request.requestedByUser.email, subject, text, html);
    }
  } catch (error) {
    console.error("[DriveDeleteRequest] Failed to email the requester the outcome:", error);
  }

  return {
    drive_delete_request_id: request.drive_delete_request_id,
    status: decision,
    item_name: entity?.name ?? request.entity_name,
    item_type: request.entity_type === "FOLDER" ? "folder" : "file",
    responded_at: request.responded_at,
    // True when the approval found the item already in Trash — nothing was
    // deleted, and the page says so instead of claiming an action it skipped.
    already_deleted: decision === DELETE_REQUEST_STATUS.APPROVED && Boolean(!entity || entity.deletedAt),
  };
};

export default {
  createDeleteRequestService,
  getDeleteRequestPublicDetailsService,
  respondToDeleteRequestService,
};
