import express from "express";
import {
  createQuotationFormatCustomSection,
  getQuotationFormatCustomSections,
  updateQuotationFormatCustomSection,
  deleteQuotationFormatCustomSection,
} from "./quotation-format-custom-section.controller.js";
import {
  createCustomSectionSchema,
  updateCustomSectionSchema,
  getCustomSectionSchema,
  paramsCustomSectionIdSchema,
  paramsQuotationFormatIdSchema,
} from "./quotation-format-custom-section.validation.js";

import authMiddleware from "../../../middleware/authMiddleware.js";
import roleMiddleware from "../../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../../middleware/caseConverterMiddleware.js";
import { REQUEST_SOURCE } from "../../../config/constants.js";
import { validateRequest } from "../../../middleware/validateRequestMiddleware.js";
import {
  scopeBuilder,
  requirePermission,
  MODULES,
  ACTIONS,
} from "../../../middleware/rbac/index.js";

const router = express.Router();

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);
router.use(scopeBuilder);

// ============================================================
//        CUSTOM SECTION ROUTES
// ============================================================

router.post(
  "/:quotation_format_id",
  requirePermission(MODULES.QUOTATION, ACTIONS.CREATE),
  validateRequest(paramsQuotationFormatIdSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(createCustomSectionSchema, REQUEST_SOURCE.BODY),
  createQuotationFormatCustomSection
);

router.get(
  "/:quotation_format_id",
  requirePermission(MODULES.QUOTATION, ACTIONS.READ),
  validateRequest(paramsQuotationFormatIdSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(getCustomSectionSchema, REQUEST_SOURCE.QUERY),
  getQuotationFormatCustomSections
);

router.put(
  "/:custom_section_id",
  requirePermission(MODULES.QUOTATION, ACTIONS.UPDATE),
  validateRequest(paramsCustomSectionIdSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateCustomSectionSchema, REQUEST_SOURCE.BODY),
  updateQuotationFormatCustomSection
);

router.delete(
  "/:custom_section_id",
  requirePermission(MODULES.QUOTATION, ACTIONS.DELETE),
  validateRequest(paramsCustomSectionIdSchema, REQUEST_SOURCE.PARAMS),
  deleteQuotationFormatCustomSection
);

export default router;
