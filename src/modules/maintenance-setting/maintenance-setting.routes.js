import express from "express";

const router = express.Router();

import {
  createMaintenanceSettings,
  updateMaintenanceSettings,
  getUserMaintenanceSettings,
} from "./maintenance-setting.controller.js";
import {
  createMaintenanceSettingSchema,
  updateMaintenanceSettingParamsSchema,
  updateMaintenanceSettingSchema,
} from "./maintenance-setting.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);

router.post(
  "/",
  validateRequest(createMaintenanceSettingSchema, REQUEST_SOURCE.BODY),
  createMaintenanceSettings,
);

router.get("/", getUserMaintenanceSettings);

router.put(
  "/",
  validateRequest(updateMaintenanceSettingSchema, REQUEST_SOURCE.BODY),
  updateMaintenanceSettings,
);

export default router;
