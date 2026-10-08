import express from "express";

const router = express.Router();

import { createPortalSettings, getPortalSettings, updatePortalSettings } from "./portal-setting.controller.js";
import { createPortalSettingsSchema, updatePortalSettingsSchema } from "./portal-setting.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { createUpload, handleMulterError } from "../../utils/s3Upload.js";
import {
  scopeBuilder,
  requirePermission,
  MODULES,
  ACTIONS,
} from "../../middleware/rbac/index.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(scopeBuilder);

const upload = createUpload("portal-setting");

router.post(
  "/",
  requirePermission(MODULES.SETTINGS, ACTIONS.CREATE),
  upload.single("defaultFacadeImage"),
  handleMulterError,
  camelToSnakeMiddleware,
  validateRequest(createPortalSettingsSchema, REQUEST_SOURCE.FORM_DATA),
  createPortalSettings,
);

router.get("/", getPortalSettings);

router.put(
  "/",
  requirePermission(MODULES.SETTINGS, ACTIONS.UPDATE),
  upload.single("defaultFacadeImage"),
  handleMulterError,
  camelToSnakeMiddleware,
  validateRequest(updatePortalSettingsSchema, REQUEST_SOURCE.FORM_DATA),
  updatePortalSettings,
);
export default router;
