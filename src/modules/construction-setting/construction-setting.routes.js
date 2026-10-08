import express from "express";

const router = express.Router();

import {
  getConstructionSettings,
  updateConstructionSettings,
} from "./construction-setting.controller.js";
import { updateConstructionSettingSchema } from "./construction-setting.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
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

// Read stays open — construction staff need config to render workflow.
router.get("/", getConstructionSettings);

router.put(
  "/",
  requirePermission(MODULES.SETTINGS, ACTIONS.UPDATE),
  validateRequest(updateConstructionSettingSchema, REQUEST_SOURCE.BODY),
  updateConstructionSettings,
);

export default router;
