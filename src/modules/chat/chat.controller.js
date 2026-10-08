import { successResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import chatService from "./chat.service.js";
import { driveFileIdsSchema } from "./chat.validation.js";

const entityTypeOf = (req) => String(req.params.entity_type).toUpperCase();

/** GET /chat/conversations — the caller's inbox. */
export async function listConversations(req, res) {
  try {
    const data = await chatService.listConversations(req.query, req.user);
    return successResponse(res, keysToCamelCase(data), "Conversations fetched successfully.");
  } catch (err) {
    return handleControllerError(res, err, "Failed to fetch conversations.");
  }
}

/** GET /chat/:entity_type/:entity_id/messages */
export async function getMessages(req, res) {
  try {
    const data = await chatService.getMessages(entityTypeOf(req), req.params.entity_id, req.query, req.user);
    return successResponse(res, keysToCamelCase(data), "Messages fetched successfully.");
  } catch (err) {
    return handleControllerError(res, err, "Failed to fetch messages.");
  }
}

/**
 * Runs before the attachment upload: a caller who may not post here is turned
 * away before any file reaches S3.
 */
export async function authorizeSend(req, res, next) {
  try {
    req.chatAccess = await chatService.resolveSendAccess(entityTypeOf(req), req.params.entity_id, req.user);
    return next();
  } catch (err) {
    return handleControllerError(res, err, "Failed to send message.");
  }
}

/**
 * `drive_file_ids`: an array in a JSON body, or one JSON-encoded field in a
 * multipart body (multer fills req.body after the case converter has run, so
 * the field arrives under exactly the name the client used).
 */
function driveFileIdsOf(req) {
  let raw = req.body?.drive_file_ids;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      throw { status: 422, message: "drive_file_ids must be a JSON array of file ids." };
    }
  }
  const { value, error } = driveFileIdsSchema.validate(raw ?? []);
  if (error) {
    throw { status: 422, message: error.message };
  }
  return value;
}

/** POST /chat/:entity_type/:entity_id/messages — JSON, or multipart with `files`. */
export async function sendMessage(req, res) {
  try {
    let driveFileIds;
    try {
      driveFileIds = driveFileIdsOf(req);
    } catch (err) {
      // The uploads are already in S3; the service is what removes them again.
      await chatService.discardChatUploads(req.files || []);
      throw err;
    }
    const data = await chatService.sendMessage(
      entityTypeOf(req),
      req.params.entity_id,
      req.body?.body,
      req.user,
      req.files || [],
      req.chatAccess,
      driveFileIds,
    );
    return successResponse(res, keysToCamelCase(data), "Message sent.");
  } catch (err) {
    return handleControllerError(res, err, "Failed to send message.");
  }
}

/** POST /chat/:entity_type/:entity_id/read */
export async function markRead(req, res) {
  try {
    const data = await chatService.markRead(entityTypeOf(req), req.params.entity_id, req.user);
    return successResponse(res, keysToCamelCase(data), "Conversation marked as read.");
  } catch (err) {
    return handleControllerError(res, err, "Failed to mark conversation as read.");
  }
}

/** GET /chat/:entity_type/:entity_id/unread */
export async function getUnreadCount(req, res) {
  try {
    const data = await chatService.getUnreadCount(entityTypeOf(req), req.params.entity_id, req.user);
    return successResponse(res, keysToCamelCase(data), "Unread count fetched successfully.");
  } catch (err) {
    return handleControllerError(res, err, "Failed to fetch unread count.");
  }
}

export default {
  listConversations,
  getMessages,
  authorizeSend,
  sendMessage,
  markRead,
  getUnreadCount,
};
