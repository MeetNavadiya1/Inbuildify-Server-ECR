import express from "express";

const router = express.Router();

import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";
import {
  createCustomSectionSchema,
  getCustomSectionsByVersionSchema,
  updateCustomSectionSchema,
  customSectionIdParamsSchema,
} from "./quotation-version-custom-section.validation.js";
import customSectionController from "./quotation-version-custom-section.controller.js";
import { createPdfUpload, handleMulterError } from "../../utils/s3Upload.js";
import {
  scopeBuilder,
  requirePermission,
  MODULES,
  ACTIONS,
} from "../../middleware/rbac/index.js";

const upload = createPdfUpload("quotation-custom-section");

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(scopeBuilder);

router.post(
  "/",
  requirePermission(MODULES.QUOTATION, ACTIONS.CREATE),
  upload.single("fileUrl"),
  handleMulterError,
  camelToSnakeMiddleware,
  validateRequest(createCustomSectionSchema, REQUEST_SOURCE.FORM_DATA),
  customSectionController.createCustomSection,
);

router.get(
  "/:quotation_version_id",
  requirePermission(MODULES.QUOTATION, ACTIONS.READ),
  validateRequest(getCustomSectionsByVersionSchema, REQUEST_SOURCE.PARAMS),
  customSectionController.getCustomSectionsByVersionId,
);

router.put(
  "/:custom_section_id",
  requirePermission(MODULES.QUOTATION, ACTIONS.UPDATE),
  upload.single("fileUrl"),
  handleMulterError,
  camelToSnakeMiddleware,
  validateRequest(customSectionIdParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateCustomSectionSchema, REQUEST_SOURCE.FORM_DATA),
  customSectionController.updateCustomSection,
);

router.delete(
  "/:custom_section_id",
  requirePermission(MODULES.QUOTATION, ACTIONS.DELETE),
  validateRequest(customSectionIdParamsSchema, REQUEST_SOURCE.PARAMS),
  customSectionController.deleteCustomSection,
);

export default router;
