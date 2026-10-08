import express from "express";

import {
  captureLandingLead,
  captureSignupRequest,
  captureDemoRequest,
} from "./landing-lead.controller.js";
import {
  captureLandingLeadSchema,
  captureSignupRequestSchema,
  captureDemoRequestSchema,
} from "./landing-lead.validation.js";
import { validateExternalToken } from "../../middleware/externalAuthMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

const router = express.Router();

/**
 * Public capture. The legacy `POST /leads/public/create` delegates to the same
 * service, so a landing build that has not been redeployed yet still lands the
 * enquiry here instead of in a builder's CRM.
 */
router.post(
  "/public",
  validateExternalToken("landing"),
  camelToSnakeMiddleware,
  validateRequest(captureLandingLeadSchema, REQUEST_SOURCE.BODY),
  captureLandingLead,
);

/**
 * The landing site's "Try it" CTAs. Public in the same way `/public` is — the
 * shared landing token is the only credential — but it creates nothing beyond a
 * request row: no tenant, no user, no password. Provisioning happens in the
 * admin console when the request is released.
 */
router.post(
  "/signup",
  validateExternalToken("landing"),
  camelToSnakeMiddleware,
  validateRequest(captureSignupRequestSchema, REQUEST_SOURCE.BODY),
  captureSignupRequest,
);

/**
 * The landing site's "Book a Demo" CTA. Public in the same way the two above
 * are — the shared landing token is the only credential. It creates a request
 * row and nothing else; booking the demo is a phone call, not a provisioning
 * step, so there is no release endpoint on the admin side, only "contacted".
 */
router.post(
  "/demo",
  validateExternalToken("landing"),
  camelToSnakeMiddleware,
  validateRequest(captureDemoRequestSchema, REQUEST_SOURCE.BODY),
  captureDemoRequest,
);

export default router;
