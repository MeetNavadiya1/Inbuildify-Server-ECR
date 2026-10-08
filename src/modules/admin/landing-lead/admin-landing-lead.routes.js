import express from "express";

import {
  listLandingLeads,
  getLandingLeadStats,
  releaseLandingLead,
  rejectLandingLead,
  reopenLandingLead,
} from "./admin-landing-lead.controller.js";
import {
  listLandingLeadsSchema,
  landingLeadStatsSchema,
  landingLeadIdSchema,
  releaseLandingLeadSchema,
  rejectLandingLeadSchema,
} from "./admin-landing-lead.validation.js";
import { validateRequest } from "../../../middleware/validateRequestMiddleware.js";
import { requireAdminPermission, ADMIN_PERMISSIONS } from "../../../middleware/adminPermissionMiddleware.js";
import { REQUEST_SOURCE } from "../../../config/constants.js";

export const landingLeadRouter = express.Router();

landingLeadRouter.get(
  "/stats",
  requireAdminPermission(ADMIN_PERMISSIONS.LANDING_LEAD_READ),
  validateRequest(landingLeadStatsSchema, REQUEST_SOURCE.QUERY),
  getLandingLeadStats,
);

landingLeadRouter.get(
  "/",
  requireAdminPermission(ADMIN_PERMISSIONS.LANDING_LEAD_READ),
  validateRequest(listLandingLeadsSchema, REQUEST_SOURCE.QUERY),
  listLandingLeads,
);

// Releasing writes into a builder's tenant, so it needs its own permission —
// a Read Only admin can watch the marketplace but not sell from it.
landingLeadRouter.post(
  "/:landing_lead_id/release",
  requireAdminPermission(ADMIN_PERMISSIONS.LANDING_LEAD_RELEASE),
  validateRequest(landingLeadIdSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(releaseLandingLeadSchema, REQUEST_SOURCE.BODY),
  releaseLandingLead,
);

landingLeadRouter.post(
  "/:landing_lead_id/reject",
  requireAdminPermission(ADMIN_PERMISSIONS.LANDING_LEAD_RELEASE),
  validateRequest(landingLeadIdSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(rejectLandingLeadSchema, REQUEST_SOURCE.BODY),
  rejectLandingLead,
);

landingLeadRouter.post(
  "/:landing_lead_id/reopen",
  requireAdminPermission(ADMIN_PERMISSIONS.LANDING_LEAD_RELEASE),
  validateRequest(landingLeadIdSchema, REQUEST_SOURCE.PARAMS),
  reopenLandingLead,
);

export default landingLeadRouter;
