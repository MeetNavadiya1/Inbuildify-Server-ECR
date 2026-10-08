import express from "express";

const router = express.Router();

import {
  createMasterSection,
  getMasterSections,
  updateMasterSection,
  deleteMasterSection,
  copyMasterSection,
} from "./quotation-format-master-section.controller.js";
import authMiddleware from "../../../middleware/authMiddleware.js";
import roleMiddleware from "../../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../../middleware/caseConverterMiddleware.js";
import {
  createMasterSectionSchema,
  updateMasterSectionSchema,
  getMasterSectionSchema,
  paramsMasterSectionIdSchema,
  paramsQuotationFormatIdSchema,
} from "./quotation-format-master-section.validation.js";
import { validateRequest } from "../../../middleware/validateRequestMiddleware.js";
import { REQUEST_SOURCE } from "../../../config/constants.js";
import {
  scopeBuilder,
  requirePermission,
  MODULES,
  ACTIONS,
} from "../../../middleware/rbac/index.js";

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);
router.use(scopeBuilder);

// ============================================================
//        MASTER SECTION ROUTES
// ============================================================

router.post(
  "/:quotation_format_id",
  requirePermission(MODULES.QUOTATION, ACTIONS.CREATE),
  validateRequest(paramsQuotationFormatIdSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(createMasterSectionSchema, REQUEST_SOURCE.BODY),
  createMasterSection,
);

router.get(
  "/:quotation_format_id",
  requirePermission(MODULES.QUOTATION, ACTIONS.READ),
  validateRequest(paramsQuotationFormatIdSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(getMasterSectionSchema, REQUEST_SOURCE.QUERY),
  getMasterSections,
);

router.put(
  "/:master_section_id",
  requirePermission(MODULES.QUOTATION, ACTIONS.UPDATE),
  validateRequest(paramsMasterSectionIdSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateMasterSectionSchema, REQUEST_SOURCE.BODY),
  updateMasterSection,
);

router.delete(
  "/:master_section_id",
  requirePermission(MODULES.QUOTATION, ACTIONS.DELETE),
  validateRequest(paramsMasterSectionIdSchema, REQUEST_SOURCE.PARAMS),
  deleteMasterSection,
);

router.post(
  "/:master_section_id/copy",
  requirePermission(MODULES.QUOTATION, ACTIONS.CREATE),
  validateRequest(paramsMasterSectionIdSchema, REQUEST_SOURCE.PARAMS),
  copyMasterSection,
);

// ============================================================
export default router;
