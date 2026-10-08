import express from "express";
import { getGlobalActivitiesController, getActivitiesTimelineController } from "./activities.controller.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import scopeBuilder from "../../middleware/rbac/scopeBuilder.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";
import { getActivitiesQuerySchema, getActivitiesTimelineQuerySchema } from "./activities.validation.js";
import { requirePermission, MODULES, ACTIONS } from "../../middleware/rbac/index.js";

const router = express.Router();

router.use(authMiddleware);
router.use(scopeBuilder);

router.get(
  "/timeline",
  requirePermission(MODULES.REPORT_ACTIVITY, ACTIONS.READ),
  validateRequest(getActivitiesTimelineQuerySchema, REQUEST_SOURCE.QUERY),
  getActivitiesTimelineController
);

router.get(
  "/",
  requirePermission(MODULES.REPORT_ACTIVITY, ACTIONS.READ),
  validateRequest(getActivitiesQuerySchema, REQUEST_SOURCE.QUERY),
  getGlobalActivitiesController
);

export default router;
