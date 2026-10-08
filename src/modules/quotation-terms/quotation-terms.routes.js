import express from "express";

import {
  getTerms,
  saveTerms,
  confirmTerms,
  getSyncSummary,
  syncTerms,
  getTermsForVersion,
  getPublicTerms,
} from "./quotation-terms.controller.js";
import {
  saveTermsSchema,
  syncTermsSchema,
  versionIdParamsSchema,
  publicTokenParamsSchema,
} from "./quotation-terms.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { rateLimit } from "../../middleware/rateLimit.middleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";
import {
  scopeBuilder,
  requirePermission,
  MODULES,
  ACTIONS,
} from "../../middleware/rbac/index.js";

const router = express.Router();

// ---------------------------------------------------------------------------
// Public route — no auth. This is the page a customer lands on from the
// "Terms & Conditions" link in a quotation PDF or on the quotation view, so it
// MUST be declared before the auth middleware below. The token is the only
// credential; the rate limit stops one machine from grinding through the token
// space or hammering the DB.
// ---------------------------------------------------------------------------
router.get(
  "/public/:token",
  rateLimit({ windowMs: 60_000, max: 60 }),
  validateRequest(publicTokenParamsSchema, REQUEST_SOURCE.PARAMS),
  getPublicTerms,
);

// ---------------------------------------------------------------------------
// Authenticated routes (builder side). Permissions ride on MODULES.QUOTATION —
// terms are part of the quotation surface, so anyone who can read/edit
// quotations can read/edit the terms that print on them.
// ---------------------------------------------------------------------------
router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);
router.use(scopeBuilder);

router.get("/", requirePermission(MODULES.QUOTATION, ACTIONS.READ), getTerms);

router.get(
  "/sync/summary",
  requirePermission(MODULES.QUOTATION, ACTIONS.READ),
  getSyncSummary,
);

router.get(
  "/version/:quotation_version_id",
  requirePermission(MODULES.QUOTATION, ACTIONS.READ),
  validateRequest(versionIdParamsSchema, REQUEST_SOURCE.PARAMS),
  getTermsForVersion,
);

router.put(
  "/",
  requirePermission(MODULES.QUOTATION, ACTIONS.UPDATE),
  validateRequest(saveTermsSchema, REQUEST_SOURCE.BODY),
  saveTerms,
);

router.post(
  "/confirm",
  requirePermission(MODULES.QUOTATION, ACTIONS.UPDATE),
  validateRequest(saveTermsSchema, REQUEST_SOURCE.BODY),
  confirmTerms,
);

router.post(
  "/sync",
  requirePermission(MODULES.QUOTATION, ACTIONS.UPDATE),
  validateRequest(syncTermsSchema, REQUEST_SOURCE.BODY),
  syncTerms,
);

export default router;
