/**
 * One way to write a drive activity entry.
 *
 * The log was being written from a dozen call sites, each assembling the row by
 * hand, and it showed: some passed `user_id: null` where the user was right
 * there, none recorded what a change was *from*, and an administrator turning
 * editing off left no entry at all. An audit trail that cannot say what changed
 * is a list of timestamps.
 *
 * So every entry goes through `recordDriveActivity`, which fills in the parts a
 * call site should not have to remember: the actor's role as it was at the time,
 * a readable sentence, and the before-and-after.
 *
 * Writing is fire-and-forget by design — a failed audit write must never fail
 * the action it describes, because the alternative is a user unable to rename a
 * file because the log table is full. It is logged loudly instead.
 */

import db from "../config/database/models/postgre-models/index.js";
import { getRoleNameById } from "./rbac.helper.js";
import logger from "../utils/logger.js";

/**
 * The actions a document's history can contain.
 *
 * Spelled out rather than left to each call site's string literal: the drawer
 * groups and labels by these, and a typo would silently produce an entry nobody
 * can filter or explain.
 */
export const DRIVE_ACTIONS = {
  UPLOAD: "UPLOAD",
  NEW_VERSION: "NEW_VERSION",
  CONVERT: "CONVERT",
  RENAME: "RENAME",
  MOVE: "MOVE",
  DELETE: "DELETE",
  DELETE_PERMANENT: "DELETE_PERMANENT",
  RESTORE: "RESTORE",
  EDITABLE_ON: "EDITABLE_ON",
  EDITABLE_OFF: "EDITABLE_OFF",
  EDITABLE_RESET: "EDITABLE_RESET",
  CREATE: "CREATE",
};

/** How each action reads in the history, and what kind of change it is. */
const ACTION_META = {
  UPLOAD: { label: "Uploaded", category: "content" },
  NEW_VERSION: { label: "Content updated", category: "content" },
  CONVERT: { label: "Converted", category: "content" },
  RENAME: { label: "Renamed", category: "metadata" },
  MOVE: { label: "Moved", category: "metadata" },
  DELETE: { label: "Moved to trash", category: "lifecycle" },
  DELETE_PERMANENT: { label: "Deleted permanently", category: "lifecycle" },
  RESTORE: { label: "Restored", category: "lifecycle" },
  EDITABLE_ON: { label: "Editing turned on", category: "permission" },
  EDITABLE_OFF: { label: "Editing turned off", category: "permission" },
  EDITABLE_RESET: { label: "Editing reset to the default", category: "permission" },
  CREATE: { label: "Created", category: "lifecycle" },
};

/** The label and change-category for an action, including unknown ones. */
export function describeAction(action) {
  const meta = ACTION_META[action];
  if (meta) return { ...meta, action };
  // An action written before this map existed, or by code that has not been
  // updated. Show it rather than hiding the row — a gap in an audit trail is
  // worse than an ugly label.
  return { action, label: String(action || "Changed").replace(/_/g, " ").toLowerCase(), category: "other" };
}

/**
 * The role a user held, for the audit snapshot.
 *
 * Prefers what the request already resolved (`req.user.role_name`, set by
 * authMiddleware) and only queries when a service was handed a bare id.
 */
async function resolveActorRole(actor) {
  if (!actor) return null;
  if (typeof actor === "string") {
    const user = await db.sequelize.models.Users.findByPk(actor, { attributes: ["role_id"] });
    return user ? getRoleNameById(user.role_id) : null;
  }
  if (actor.role_name) return actor.role_name;
  if (actor.role_id) return getRoleNameById(actor.role_id);
  return null;
}

/** The user id out of whatever the caller had to hand. */
const actorId = (actor) => (typeof actor === "string" ? actor : actor?.users_id || null);

/**
 * Record one entry.
 *
 * @param {object}  entry
 * @param {string}  entry.companyId
 * @param {object|string|null} entry.actor  a user row, `req.user`, or a bare id
 * @param {string}  entry.action            one of DRIVE_ACTIONS
 * @param {"FILE"|"FOLDER"} entry.entityType
 * @param {string}  entry.entityId
 * @param {string}  [entry.entityName]
 * @param {string}  [entry.details]         a sentence, when the values alone do not explain it
 * @param {*}       [entry.oldValue]        before — omitted for actions with no before
 * @param {*}       [entry.newValue]        after
 * @returns {Promise<void>} resolves even when the write fails
 */
export async function recordDriveActivity({
  companyId,
  actor,
  action,
  entityType = "FILE",
  entityId,
  entityName = null,
  details = null,
  oldValue,
  newValue,
}) {
  const { DriveActivityLog } = db.sequelize.models;
  if (!DriveActivityLog || !companyId || !entityId) return;

  try {
    await DriveActivityLog.create({
      company_id: companyId,
      user_id: actorId(actor),
      actor_role: await resolveActorRole(actor),
      action,
      entity_type: entityType,
      entity_id: entityId,
      entity_name: entityName,
      details,
      old_value: oldValue === undefined || oldValue === null ? null : String(oldValue),
      new_value: newValue === undefined || newValue === null ? null : String(newValue),
    });
  } catch (error) {
    // Never rethrow: the caller's action has already happened, and failing it
    // now would leave the file changed and the user told it was not.
    logger.error("[drive-activity] could not record an entry", {
      action,
      entityId,
      message: error?.message,
    });
  }
}

export default { recordDriveActivity, describeAction, DRIVE_ACTIONS };
