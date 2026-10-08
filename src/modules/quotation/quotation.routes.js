import express from "express";

const router = express.Router();

import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import { validateExternalToken } from "../../middleware/externalAuthMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";
import {
  createQuotationSchema,
  deleteQuotationSchema,
  updateQuotationVersionParamsSchema,
  updateQuotationVersionBodySchema,
  duplicateQuotationVersionSchema,
  compareQuotationVersionsParamsSchema,
  compareQuotationVersionsBodySchema,
  removePackageFromVersionSchema,
  getQuotationVersionsQuerySchema,
  sendEngineerEmailBodySchema,
  quotationUsageHistoryParamsSchema,
  quotationUsageHistoryQuerySchema,
} from "./quotation.validation.js";
import quotationController from "./quotation.controller.js";
import { createPdfUpload, handleMulterError } from "../../utils/s3Upload.js";
import {
  scopeBuilder,
  requirePermission,
  MODULES,
  ACTIONS,
} from "../../middleware/rbac/index.js";

// Public route — no auth required; must be registered before auth middleware
router.get("/view/:hash", quotationController.viewQuotationByHash);

// External Structural Engineer Upload Routes
// External engineers do not have an active session/JWT — these routes are
// secured by validateExternalToken (encrypted, 5-minute time-sensitive token).
router.post(
  "/version/:quotation_version_id/structure-engineer-report",
  validateExternalToken,
  createPdfUpload("quotation-structure-engineer-reports", 10 * 1024 * 1024).single("pdf"),
  handleMulterError,
  camelToSnakeMiddleware,
  validateRequest(updateQuotationVersionParamsSchema, REQUEST_SOURCE.PARAMS),
  quotationController.uploadStructureEngineerReport,
);

// External read endpoint used by the public upload page to render builder
// name and property details before the engineer submits their report.
router.get(
  "/version/:quotation_version_id/public-details",
  validateExternalToken,
  quotationController.getPublicDetailsByVersionId,
);

// Update (replace) an already-submitted structure engineer report.
// Same auth and file-handling as the POST above; the upsert helper
// overwrites the existing DriveFile s3_key in-place.
router.put(
  "/version/:quotation_version_id/structure-engineer-report",
  validateExternalToken,
  createPdfUpload("quotation-structure-engineer-reports", 10 * 1024 * 1024).single("pdf"),
  handleMulterError,
  camelToSnakeMiddleware,
  validateRequest(updateQuotationVersionParamsSchema, REQUEST_SOURCE.PARAMS),
  quotationController.updateStructureEngineerReport,
);

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(scopeBuilder);


// List all quotations (no lead filter) — must be before /:leads_id
router.get(
  "/",
  requirePermission(MODULES.QUOTATION, ACTIONS.READ),
  quotationController.getAllQuotations,
);

// Get quotation status counts
router.get(
  "/status-counts",
  requirePermission(MODULES.QUOTATION, ACTIONS.READ),
  quotationController.getQuotationStatusCounts,
);

// Quotation filter options
router.get(
  "/filter-options",
  requirePermission(MODULES.QUOTATION, ACTIONS.READ),
  quotationController.getQuotationFilterOptions,
);

// Quotation history for a master-data entity — backs the "Quotation History"
// drawer on the settings master pages (pricing, floor plan, facade, package, colour).
// Literal prefix, so it must stay above /:quotation_id.
router.get(
  "/usage/:entity_type/:entity_id",
  requirePermission(MODULES.QUOTATION, ACTIONS.READ),
  validateRequest(quotationUsageHistoryParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(quotationUsageHistoryQuerySchema, REQUEST_SOURCE.QUERY),
  quotationController.getQuotationUsageHistory,
);

router.post(
  "/compare/:leads_id",
  requirePermission(MODULES.QUOTATION, ACTIONS.READ),
  validateRequest(compareQuotationVersionsParamsSchema, REQUEST_SOURCE.PARAMS),
  camelToSnakeMiddleware,
  validateRequest(compareQuotationVersionsBodySchema, REQUEST_SOURCE.BODY),
  quotationController.compareQuotationVersions,
);

router.get(
  "/version/:quotation_id",
  requirePermission(MODULES.QUOTATION, ACTIONS.READ),
  validateRequest(deleteQuotationSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(getQuotationVersionsQuerySchema, REQUEST_SOURCE.QUERY),
  quotationController.getQuotationVersions,
);

router.get(
  "/lead/:leads_id",
  requirePermission(MODULES.QUOTATION, ACTIONS.READ),
  validateRequest(compareQuotationVersionsParamsSchema, REQUEST_SOURCE.PARAMS),
  quotationController.getQuotationsByLeadId,
);

router.post(
  "/:leads_id",
  requirePermission(MODULES.QUOTATION, ACTIONS.CREATE),
  validateRequest(createQuotationSchema, REQUEST_SOURCE.PARAMS),
  quotationController.createQuotation,
);

router.get(
  "/version-details/:quotation_version_id",
  requirePermission(MODULES.QUOTATION, ACTIONS.READ),
  validateRequest(updateQuotationVersionParamsSchema, REQUEST_SOURCE.PARAMS),
  quotationController.getQuotationVersionById,
);

router.get(
  "/:quotation_id",
  requirePermission(MODULES.QUOTATION, ACTIONS.READ),
  validateRequest(deleteQuotationSchema, REQUEST_SOURCE.PARAMS),
  quotationController.getQuotationById,
);

router.delete(
  "/:quotation_id",
  requirePermission(MODULES.QUOTATION, ACTIONS.DELETE),
  validateRequest(deleteQuotationSchema, REQUEST_SOURCE.PARAMS),
  quotationController.deleteQuotation,
);

router.put(
  "/version/:quotation_version_id",
  requirePermission(MODULES.QUOTATION, ACTIONS.UPDATE),
  createPdfUpload("quotation-reports").single("uploadReport"),
  handleMulterError,
  camelToSnakeMiddleware,
  validateRequest(updateQuotationVersionParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateQuotationVersionBodySchema, REQUEST_SOURCE.FORM_DATA),
  quotationController.updateQuotationVersion,
);

router.post(
  "/version/:quotation_version_id/duplicate",
  requirePermission(MODULES.QUOTATION, ACTIONS.CREATE),
  validateRequest(duplicateQuotationVersionSchema, REQUEST_SOURCE.PARAMS),
  camelToSnakeMiddleware,
  quotationController.duplicateQuotationVersion,
);

router.delete(
  "/version/:quotation_version_id/packages/:package_id",
  requirePermission(MODULES.QUOTATION, ACTIONS.UPDATE),
  validateRequest(removePackageFromVersionSchema, REQUEST_SOURCE.PARAMS),
  camelToSnakeMiddleware,
  quotationController.removePackageFromVersion,
);

router.get(
  "/version/:quotation_version_id/pdf",
  requirePermission(MODULES.QUOTATION, ACTIONS.READ),
  validateRequest(updateQuotationVersionParamsSchema, REQUEST_SOURCE.PARAMS),
  quotationController.previewPDF,
);

router.post(
  "/version/:quotation_version_id/send",
  requirePermission(MODULES.QUOTATION, ACTIONS.UPDATE),
  validateRequest(updateQuotationVersionParamsSchema, REQUEST_SOURCE.PARAMS),
  quotationController.sendQuotationEmail,
);

// Slide-over panel preview data (engineer, PDF existence/links, templates).
router.get(
  "/version/:quotation_version_id/engineer-mail-preview",
  validateRequest(updateQuotationVersionParamsSchema, REQUEST_SOURCE.PARAMS),
  quotationController.getEngineerMailPreview,
);

// Generate the Engineering Requirement PDF on demand and return a presigned URL.
router.post(
  "/version/:quotation_version_id/generate-engineering-requirement",
  validateRequest(updateQuotationVersionParamsSchema, REQUEST_SOURCE.PARAMS),
  quotationController.generateEngineeringRequirement,
);

router.post(
  "/version/:quotation_version_id/send-engineer-email",
  requirePermission(MODULES.QUOTATION, ACTIONS.UPDATE),
  validateRequest(updateQuotationVersionParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(sendEngineerEmailBodySchema, REQUEST_SOURCE.BODY),
  quotationController.sendEngineerEmail,
);

export default router;
