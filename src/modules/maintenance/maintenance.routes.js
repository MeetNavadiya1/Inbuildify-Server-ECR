import express from "express";

const router = express.Router();

import {
  getAllMaintenance,
  getMaintenanceStats,
  getMaintenanceById,
  updateMaintenanceStatus,
  assignSupervisor,
  revertToConstruction,
  createRequest,
  updateRequest,
  deleteRequest,
  addRequestTask,
  updateRequestTask,
  deleteRequestTask,
  notify,
  bookingReminder,
  getDocuments,
  uploadDocument,
  deleteDocument,
  getSiteImages,
  uploadSiteImage,
  deleteSiteImage,
  getTaskAttachments,
  uploadTaskAttachment,
  deleteTaskAttachment,
  getActivityLog,
} from "./maintenance.controller.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import { scopeBuilder, requirePermission, MODULES, ACTIONS } from "../../middleware/rbac/index.js";
import { REQUEST_SOURCE } from "../../config/constants.js";
import { createUpload, createImageUpload, createDocumentUpload, handleMulterError } from "../../utils/s3Upload.js";
import {
  getMaintenanceByIdSchema,
  getAllMaintenanceQuerySchema,
  updateMaintenanceStatusSchema,
  assignSupervisorSchema,
  createRequestSchema,
  updateRequestSchema,
  requestIdParamSchema,
  taskIdParamSchema,
  addTaskSchema,
  updateTaskSchema,
  notifySchema,
  bookingReminderSchema,
} from "./maintenance.validation.js";

const upload = createUpload("maintenance");
const imageUpload = createImageUpload("maintenance/site-images");
const attachmentUpload = createDocumentUpload("maintenance/task-attachments");
// Maintenance → Documents holds real documents (PDF, Word, Excel, CSV, text)
// alongside images. `upload` above cannot serve it: its filter is driven by the
// FILE_TYPES env var, which lists image extensions only, so every PDF was
// rejected with "Invalid file type". Same S3 prefix as before so existing
// documents keep resolving.
const documentUpload = createDocumentUpload("maintenance");

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(scopeBuilder);

// Dashboard list + stat cards
router.get(
  "/",
  requirePermission(MODULES.MAINTENANCE, ACTIONS.READ),
  camelToSnakeMiddleware,
  validateRequest(getAllMaintenanceQuerySchema, REQUEST_SOURCE.QUERY),
  getAllMaintenance,
);
router.get("/stats", requirePermission(MODULES.MAINTENANCE, ACTIONS.READ), getMaintenanceStats);

router.get(
  "/:maintenance_id",
  requirePermission(MODULES.MAINTENANCE, ACTIONS.READ),
  validateRequest(getMaintenanceByIdSchema, REQUEST_SOURCE.PARAMS),
  getMaintenanceById,
);

router.patch(
  "/:maintenance_id/status",
  requirePermission(MODULES.MAINTENANCE, ACTIONS.UPDATE),
  camelToSnakeMiddleware,
  validateRequest(getMaintenanceByIdSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateMaintenanceStatusSchema, REQUEST_SOURCE.BODY),
  updateMaintenanceStatus,
);

router.put(
  "/:maintenance_id/supervisor",
  requirePermission(MODULES.MAINTENANCE, ACTIONS.UPDATE),
  camelToSnakeMiddleware,
  validateRequest(getMaintenanceByIdSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(assignSupervisorSchema, REQUEST_SOURCE.BODY),
  assignSupervisor,
);

router.post(
  "/:maintenance_id/revert-to-construction",
  requirePermission(MODULES.MAINTENANCE, ACTIONS.DELETE),
  validateRequest(getMaintenanceByIdSchema, REQUEST_SOURCE.PARAMS),
  revertToConstruction,
);

const parseDescriptionsMiddleware = (req, res, next) => {
  if (req.body && typeof req.body.descriptions === "string") {
    try {
      req.body.descriptions = JSON.parse(req.body.descriptions);
    } catch (err) {
      // Leave it, validator will catch invalid formats
    }
  }
  next();
};

router.post(
  "/:maintenance_id/requests",
  requirePermission(MODULES.MAINTENANCE, ACTIONS.CREATE),
  upload.single("attachFile"),
  handleMulterError,
  parseDescriptionsMiddleware,
  camelToSnakeMiddleware,
  validateRequest(getMaintenanceByIdSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(createRequestSchema, REQUEST_SOURCE.FORM_DATA),
  createRequest,
);

router.put(
  "/requests/:request_id",
  requirePermission(MODULES.MAINTENANCE, ACTIONS.UPDATE),
  upload.single("attachFile"),
  handleMulterError,
  camelToSnakeMiddleware,
  validateRequest(requestIdParamSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateRequestSchema, REQUEST_SOURCE.FORM_DATA),
  updateRequest,
);

router.delete(
  "/requests/:request_id",
  requirePermission(MODULES.MAINTENANCE, ACTIONS.DELETE),
  validateRequest(requestIdParamSchema, REQUEST_SOURCE.PARAMS),
  deleteRequest,
);

router.post(
  "/requests/:request_id/tasks",
  requirePermission(MODULES.MAINTENANCE, ACTIONS.CREATE),
  camelToSnakeMiddleware,
  validateRequest(requestIdParamSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(addTaskSchema, REQUEST_SOURCE.BODY),
  addRequestTask,
);

const handleFormFilePresenceMiddleware = (req, res, next) => {
  const file = req.files?.file?.[0] || req.files?.image?.[0];
  if (file) {
    req.body.file = file.originalname;
  }
  next();
};

router.put(
  "/requests/tasks/:task_id",
  requirePermission(MODULES.MAINTENANCE, ACTIONS.UPDATE),
  attachmentUpload.fields([{ name: 'file', maxCount: 1 }, { name: 'image', maxCount: 1 }]),
  handleMulterError,
  handleFormFilePresenceMiddleware,
  camelToSnakeMiddleware,
  validateRequest(taskIdParamSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateTaskSchema, REQUEST_SOURCE.FORM_DATA),
  updateRequestTask,
);

router.delete(
  "/requests/tasks/:task_id",
  requirePermission(MODULES.MAINTENANCE, ACTIONS.DELETE),
  validateRequest(taskIdParamSchema, REQUEST_SOURCE.PARAMS),
  deleteRequestTask,
);

// ── Task Attachments ─────────────────────────────────────────────────────────
router.get(
  "/requests/tasks/:task_id/attachments",
  requirePermission(MODULES.MAINTENANCE, ACTIONS.READ),
  validateRequest(taskIdParamSchema, REQUEST_SOURCE.PARAMS),
  getTaskAttachments,
);

// Multipart route — multer must parse the body before any body middleware.
// Field name: "file". Accepts images and documents (pdf/word/excel/text).
router.post(
  "/requests/tasks/:task_id/attachments",
  requirePermission(MODULES.MAINTENANCE, ACTIONS.UPDATE),
  validateRequest(taskIdParamSchema, REQUEST_SOURCE.PARAMS),
  attachmentUpload.single("file"),
  handleMulterError,
  uploadTaskAttachment,
);

router.delete(
  "/task-attachments/:file_id",
  requirePermission(MODULES.MAINTENANCE, ACTIONS.DELETE),
  deleteTaskAttachment,
);

router.post(
  "/:maintenance_id/notify",
  requirePermission(MODULES.MAINTENANCE, ACTIONS.UPDATE),
  camelToSnakeMiddleware,
  validateRequest(getMaintenanceByIdSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(notifySchema, REQUEST_SOURCE.BODY),
  notify,
);

router.post(
  "/:maintenance_id/booking-reminder",
  requirePermission(MODULES.MAINTENANCE, ACTIONS.UPDATE),
  camelToSnakeMiddleware,
  validateRequest(getMaintenanceByIdSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(bookingReminderSchema, REQUEST_SOURCE.BODY),
  bookingReminder,
);

router.get(
  "/:maintenance_id/documents",
  requirePermission(MODULES.MAINTENANCE, ACTIONS.READ),
  validateRequest(getMaintenanceByIdSchema, REQUEST_SOURCE.PARAMS),
  getDocuments,
);

// Multipart route — multer must parse the body BEFORE camelToSnakeMiddleware
// touches req.body (mirrors master-facade.routes.js's upload ordering).
router.post(
  "/:maintenance_id/documents",
  requirePermission(MODULES.MAINTENANCE, ACTIONS.CREATE),
  validateRequest(getMaintenanceByIdSchema, REQUEST_SOURCE.PARAMS),
  documentUpload.single("file"),
  handleMulterError,
  camelToSnakeMiddleware,
  uploadDocument,
);

router.delete(
  "/documents/:file_id",
  requirePermission(MODULES.MAINTENANCE, ACTIONS.DELETE),
  deleteDocument,
);

// ── Site Images ──────────────────────────────────────────────────────────────
router.get(
  "/:maintenance_id/site-images",
  requirePermission(MODULES.MAINTENANCE, ACTIONS.READ),
  validateRequest(getMaintenanceByIdSchema, REQUEST_SOURCE.PARAMS),
  getSiteImages,
);

// Multipart route — multer must parse the body before any body middleware.
// Field name: "image".
router.post(
  "/:maintenance_id/site-images",
  requirePermission(MODULES.MAINTENANCE, ACTIONS.CREATE),
  validateRequest(getMaintenanceByIdSchema, REQUEST_SOURCE.PARAMS),
  imageUpload.single("image"),
  handleMulterError,
  uploadSiteImage,
);

router.delete(
  "/site-images/:file_id",
  requirePermission(MODULES.MAINTENANCE, ACTIONS.DELETE),
  deleteSiteImage,
);

router.get(
  "/:maintenance_id/activity-log",
  requirePermission(MODULES.MAINTENANCE, ACTIONS.READ),
  validateRequest(getMaintenanceByIdSchema, REQUEST_SOURCE.PARAMS),
  getActivityLog,
);

export default router;
