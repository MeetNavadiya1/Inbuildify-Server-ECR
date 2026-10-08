import express from "express";

const router = express.Router();

import {
  updateQuotationSettings,
  getQuotationSetting,
} from "./quotation-setting.controller.js";
import {
  updateQuotationSettingParamsSchema,
  updateQuotationSettingSchema,
} from "./quotation-setting.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";
import {
  scopeBuilder,
  requirePermission,
  MODULES,
  ACTIONS,
} from "../../middleware/rbac/index.js";

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);
router.use(scopeBuilder);

router.get(
  "/fetch",
  requirePermission(MODULES.QUOTATION, ACTIONS.READ),
  getQuotationSetting,
);

router.put(
  "/:quotation_settings_id",
  requirePermission(MODULES.QUOTATION, ACTIONS.UPDATE),
  validateRequest(updateQuotationSettingParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateQuotationSettingSchema, REQUEST_SOURCE.BODY),
  updateQuotationSettings,
);

export default router;
