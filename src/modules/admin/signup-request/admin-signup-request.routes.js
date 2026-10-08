import express from "express";

import {
  listSignupRequests,
  getSignupRequestStats,
  releaseSignupRequest,
  rejectSignupRequest,
  reopenSignupRequest,
} from "./admin-signup-request.controller.js";
import {
  listSignupRequestsSchema,
  signupRequestIdSchema,
  releaseSignupRequestSchema,
  rejectSignupRequestSchema,
} from "./admin-signup-request.validation.js";
import { validateRequest } from "../../../middleware/validateRequestMiddleware.js";
import { requireAdminPermission, ADMIN_PERMISSIONS } from "../../../middleware/adminPermissionMiddleware.js";
import { REQUEST_SOURCE } from "../../../config/constants.js";

export const signupRequestRouter = express.Router();

signupRequestRouter.get(
  "/stats",
  requireAdminPermission(ADMIN_PERMISSIONS.SIGNUP_REQUEST_READ),
  getSignupRequestStats,
);

signupRequestRouter.get(
  "/",
  requireAdminPermission(ADMIN_PERMISSIONS.SIGNUP_REQUEST_READ),
  validateRequest(listSignupRequestsSchema, REQUEST_SOURCE.QUERY),
  listSignupRequests,
);

// Approving creates a whole tenant and emails out a password, so it gets its own
// permission for the same reason releasing a landing enquiry does — a Read Only
// admin can triage the queue without being able to hand accounts out.
signupRequestRouter.post(
  "/:landing_lead_id/release",
  requireAdminPermission(ADMIN_PERMISSIONS.SIGNUP_REQUEST_RELEASE),
  validateRequest(signupRequestIdSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(releaseSignupRequestSchema, REQUEST_SOURCE.BODY),
  releaseSignupRequest,
);

signupRequestRouter.post(
  "/:landing_lead_id/reject",
  requireAdminPermission(ADMIN_PERMISSIONS.SIGNUP_REQUEST_RELEASE),
  validateRequest(signupRequestIdSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(rejectSignupRequestSchema, REQUEST_SOURCE.BODY),
  rejectSignupRequest,
);

signupRequestRouter.post(
  "/:landing_lead_id/reopen",
  requireAdminPermission(ADMIN_PERMISSIONS.SIGNUP_REQUEST_RELEASE),
  validateRequest(signupRequestIdSchema, REQUEST_SOURCE.PARAMS),
  reopenSignupRequest,
);

export default signupRequestRouter;
