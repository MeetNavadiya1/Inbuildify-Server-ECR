import express from "express";
import {
  listConversations,
  getMessages,
  authorizeSend,
  sendMessage,
  markRead,
  getUnreadCount,
} from "./chat.controller.js";
import { MAX_ATTACHMENTS } from "./chat.service.js";
import { createChatAttachmentUpload, handleMulterError } from "../../utils/s3Upload.js";
import {
  chatEntityParamsSchema,
  getMessagesQuerySchema,
  listConversationsQuerySchema,
} from "./chat.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { rateLimit } from "../../middleware/rateLimit.middleware.js";
import { scopeBuilder } from "../../middleware/rbac/index.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

// No router-level requirePermission: a thread belongs to a lead OR a job, and
// Contacts hold neither module permission yet must reach their own threads.
// Every handler goes through chatService.resolveChatAccess, which applies the
// module permission, tenant and row scope for the specific record.

const router = express.Router();

// PNG and JPEG only, 10MB per file. Only acts on
// multipart requests — a plain JSON text message passes straight through.
const attachmentUpload = createChatAttachmentUpload("chat-attachments");

router.use(authMiddleware);
router.use(scopeBuilder);
router.use(camelToSnakeMiddleware);

router.get(
  "/conversations",
  validateRequest(listConversationsQuerySchema, REQUEST_SOURCE.QUERY),
  listConversations,
);

router.get(
  "/:entity_type/:entity_id/messages",
  validateRequest(chatEntityParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(getMessagesQuerySchema, REQUEST_SOURCE.QUERY),
  getMessages,
);

router.post(
  "/:entity_type/:entity_id/messages",
  rateLimit({ windowMs: 60_000, max: 30, message: "You are sending messages too quickly. Please wait a moment." }),
  validateRequest(chatEntityParamsSchema, REQUEST_SOURCE.PARAMS),
  // Access first, so nothing is uploaded for a thread the caller cannot post in.
  authorizeSend,
  attachmentUpload.array("files", MAX_ATTACHMENTS),
  handleMulterError,
  // Body rules (sendMessageSchema) are enforced in chatService.sendMessage, not
  // here: by now the files are in S3, and only the service removes them again
  // when it refuses the message.
  sendMessage,
);

router.post(
  "/:entity_type/:entity_id/read",
  validateRequest(chatEntityParamsSchema, REQUEST_SOURCE.PARAMS),
  markRead,
);

router.get(
  "/:entity_type/:entity_id/unread",
  validateRequest(chatEntityParamsSchema, REQUEST_SOURCE.PARAMS),
  getUnreadCount,
);

export default router;
