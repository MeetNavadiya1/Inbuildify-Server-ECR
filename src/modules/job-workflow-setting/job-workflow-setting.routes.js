import express from "express";

const router = express.Router();

import {
  createJobWorkflowSetting,
  updateJobColorSetting,
  getUserJobWorkflowSettings,
} from "./job-workflow-setting.controller.js";
import {
  createJobWorkflowSettingSchema,
  updateJobWorkflowSettingSchema,
} from "./job-workflow-setting.validation.js";
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
  validateRequest(createJobWorkflowSettingSchema, REQUEST_SOURCE.BODY),
  createJobWorkflowSetting,
);

router.get("/", getUserJobWorkflowSettings);

router.put(
  "/",
  validateRequest(updateJobWorkflowSettingSchema, REQUEST_SOURCE.BODY),
  updateJobColorSetting,
);

export default router;
