import express from "express";

const router = express.Router();
import { createOpportunity, getAllOpportunities } from "./opportunities.controller.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import { createOpportunitySchema, getAllOpportunitiesSchema } from "./opportunity.validation.js";
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

router.post(
  "/:lead_id",
  requirePermission(MODULES.OPPORTUNITY, ACTIONS.CREATE),
  validateRequest(createOpportunitySchema, REQUEST_SOURCE.PARAMS),
  createOpportunity,
);

router.get(
  "/",
  requirePermission(MODULES.OPPORTUNITY, ACTIONS.READ),
  validateRequest(getAllOpportunitiesSchema, REQUEST_SOURCE.QUERY),
  getAllOpportunities,
);

export default router;
