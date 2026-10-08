import express from "express";

const router = express.Router();

import { createJobSettings, updateJobSettings, getUserJobSettings } from "./job-setting.controller.js";
import { createJobSettingsSchema, updateJobSettingSchema } from "./job-setting.validation.js";
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

router.post(
  "/",
  requirePermission(MODULES.SETTINGS, ACTIONS.CREATE),
  validateRequest(createJobSettingsSchema, REQUEST_SOURCE.BODY),
  createJobSettings,
);

// Read stays open — staff need job config/settings to render job screens.
router.get("/", getUserJobSettings);

router.put(
  "/",
  requirePermission(MODULES.SETTINGS, ACTIONS.UPDATE),
  validateRequest(updateJobSettingSchema, REQUEST_SOURCE.BODY),
  updateJobSettings,
);

export default router;
