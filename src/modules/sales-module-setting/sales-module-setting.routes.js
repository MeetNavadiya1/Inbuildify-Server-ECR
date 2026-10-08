import express from "express";

const router = express.Router();

import { updateSalesModuleSettings, getSalesModuleSetting } from "./sales-module-setting.controller.js";
import { updateSalesModuleSettingSchema } from "./sales-module-setting.validation.js";
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

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);
router.use(scopeBuilder);

// Read stays open — operational roles need sales config to render the pipeline.
router.get("/fetch", getSalesModuleSetting);

router.put(
  "/",
  requirePermission(MODULES.SETTINGS, ACTIONS.UPDATE),
  validateRequest(updateSalesModuleSettingSchema, REQUEST_SOURCE.BODY),
  updateSalesModuleSettings,
);
export default router;
