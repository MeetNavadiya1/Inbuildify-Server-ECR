import express from "express";

const router = express.Router();

import {
  createJobVariationSettings,
  updateJobVariationSettings,
  getUserJobVariationSettings,
} from "./job-variation-setting.controller.js";
import {
  createJobVariationSettingSchema,
  updateJobVariationSettingParamsSchema,
  updateJobVariationSettingSchema,
} from "./job-variation-setting.validation.js";
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
  validateRequest(createJobVariationSettingSchema, REQUEST_SOURCE.BODY),
  createJobVariationSettings,
);

router.get("/", getUserJobVariationSettings);

router.put(
  "/",
  validateRequest(updateJobVariationSettingSchema, REQUEST_SOURCE.BODY),
  updateJobVariationSettings,
);

export default router;
