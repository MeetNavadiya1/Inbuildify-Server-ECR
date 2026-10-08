import express from "express";

const router = express.Router();

import { createGeneralSetting, updateGeneralSettings, getUserGeneralSettings } from "./general-setting.controller.js";
import { createGeneralSettigSchema, updateGeneralSettingsSchema } from "./general-setting.validation.js";
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
//not Use
router.post(
  "/",
  requirePermission(MODULES.SETTINGS, ACTIONS.CREATE),
  validateRequest(createGeneralSettigSchema, REQUEST_SOURCE.BODY),
  createGeneralSetting,
);

router.put(
  "/",
  requirePermission(MODULES.SETTINGS, ACTIONS.UPDATE),
  validateRequest(updateGeneralSettingsSchema, REQUEST_SOURCE.BODY),
  updateGeneralSettings,
);

// Per-user UI preferences (theme etc.) — NOT admin settings, stays open to all.
router.get("/user", getUserGeneralSettings);

export default router;
