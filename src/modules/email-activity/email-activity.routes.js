import express from "express";

const router = express.Router();

import {
  getEmailActivities,
  getEmailActivityById,
} from "./email-activity.controller.js";
import {
  getEmailActivitiesSchema,
  getEmailActivityByIdSchema,
} from "./email-activity.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import scopeBuilder from "../../middleware/rbac/scopeBuilder.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(scopeBuilder);


// GET /email-activity — list with search, filter, pagination
router.get(
  "/",
  validateRequest(getEmailActivitiesSchema, REQUEST_SOURCE.QUERY),
  getEmailActivities,
);

// GET /email-activity/:notifications_id — single activity detail
router.get(
  "/:notifications_id",
  validateRequest(getEmailActivityByIdSchema, REQUEST_SOURCE.PARAMS),
  getEmailActivityById,
);

export default router;
