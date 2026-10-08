import express from "express";

const router = express.Router();

import {
  listDocuments,
  getDocumentDetail,
  getDocumentActivity,
  setDocumentEditable,
} from "./document-management.controller.js";
import {
  listDocumentsSchema,
  documentActivitySchema,
  setDocumentEditableSchema,
} from "./document-management.validation.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import {
  scopeBuilder,
  requirePermission,
  MODULES,
  ACTIONS,
} from "../../middleware/rbac/index.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

/**
 * Admin → Document → Document Management.
 *
 * Guarded by the settings module, the same permission that governs Admin →
 * General → Editable PDF Configuration: this screen decides the same kind of
 * thing at a finer grain, so it answers to the same roles rather than a new one.
 */

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);
router.use(scopeBuilder);

router.get(
  "/",
  requirePermission(MODULES.SETTINGS, ACTIONS.READ),
  validateRequest(listDocumentsSchema, REQUEST_SOURCE.QUERY),
  listDocuments,
);

router.get("/:id", requirePermission(MODULES.SETTINGS, ACTIONS.READ), getDocumentDetail);

// The audit history. READ on the same module: an activity row names a user and
// says what they did, which is not something to hand to anyone who cannot
// already see the document itself.
router.get(
  "/:id/activity",
  requirePermission(MODULES.SETTINGS, ACTIONS.READ),
  validateRequest(documentActivitySchema, REQUEST_SOURCE.QUERY),
  getDocumentActivity,
);

router.patch(
  "/:id/editable",
  requirePermission(MODULES.SETTINGS, ACTIONS.UPDATE),
  validateRequest(setDocumentEditableSchema, REQUEST_SOURCE.BODY),
  setDocumentEditable,
);

export default router;
