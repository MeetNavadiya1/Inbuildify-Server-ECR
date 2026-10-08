import express from "express";

import {
  listDemoRequests,
  getDemoRequestStats,
  markDemoRequestContacted,
  rejectDemoRequest,
  reopenDemoRequest,
} from "./admin-demo-request.controller.js";
import {
  listDemoRequestsSchema,
  demoRequestIdSchema,
  demoRequestNotesSchema,
} from "./admin-demo-request.validation.js";
import { validateRequest } from "../../../middleware/validateRequestMiddleware.js";
import { requireAdminPermission, ADMIN_PERMISSIONS } from "../../../middleware/adminPermissionMiddleware.js";
import { REQUEST_SOURCE } from "../../../config/constants.js";

export const demoRequestRouter = express.Router();

demoRequestRouter.get(
  "/stats",
  requireAdminPermission(ADMIN_PERMISSIONS.DEMO_REQUEST_READ),
  getDemoRequestStats,
);

demoRequestRouter.get(
  "/",
  requireAdminPermission(ADMIN_PERMISSIONS.DEMO_REQUEST_READ),
  validateRequest(listDemoRequestsSchema, REQUEST_SOURCE.QUERY),
  listDemoRequests,
);

// Nothing here reaches outside the console — no tenant, no lead, no email — but
// it is still a mutation, so it sits behind its own permission and the Read Only
// role does not get it.
demoRequestRouter.post(
  "/:landing_lead_id/contacted",
  requireAdminPermission(ADMIN_PERMISSIONS.DEMO_REQUEST_UPDATE),
  validateRequest(demoRequestIdSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(demoRequestNotesSchema, REQUEST_SOURCE.BODY),
  markDemoRequestContacted,
);

demoRequestRouter.post(
  "/:landing_lead_id/reject",
  requireAdminPermission(ADMIN_PERMISSIONS.DEMO_REQUEST_UPDATE),
  validateRequest(demoRequestIdSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(demoRequestNotesSchema, REQUEST_SOURCE.BODY),
  rejectDemoRequest,
);

demoRequestRouter.post(
  "/:landing_lead_id/reopen",
  requireAdminPermission(ADMIN_PERMISSIONS.DEMO_REQUEST_UPDATE),
  validateRequest(demoRequestIdSchema, REQUEST_SOURCE.PARAMS),
  reopenDemoRequest,
);

export default demoRequestRouter;
