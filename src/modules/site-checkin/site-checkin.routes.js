import express from "express";

const router = express.Router();

import {
  listRecords,
  confirmRecord,
  rejectRecord,
  getPublicFields,
  submitPublicCheckin,
} from "./site-checkin.controller.js";
import {
  listRecordsSchema,
  recordIdParamsSchema,
  confirmRejectSchema,
  publicTokenParamsSchema,
  publicSubmitSchema,
} from "./site-checkin.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { rateLimit } from "../../middleware/rateLimit.middleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

// ---------------------------------------------------------------------------
// Public routes — no auth. A supplier scans the site QR (which encodes the
// builder's company_id as the token) and opens these. Must be registered
// BEFORE the auth middleware below. Per-IP rate limits stop one machine from
// spamming the server/DB (loads are looser than submissions).
// ---------------------------------------------------------------------------
router.get(
  "/public/:token",
  rateLimit({ windowMs: 60_000, max: 60 }),
  validateRequest(publicTokenParamsSchema, REQUEST_SOURCE.PARAMS),
  getPublicFields,
);

router.post(
  "/public/:token",
  rateLimit({
    windowMs: 60_000,
    max: 8,
    message: "Too many check-in submissions from this device. Please wait a minute and try again.",
  }),
  camelToSnakeMiddleware,
  validateRequest(publicTokenParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(publicSubmitSchema, REQUEST_SOURCE.BODY),
  submitPublicCheckin,
);

// ---------------------------------------------------------------------------
// Authenticated routes (builder side)
// ---------------------------------------------------------------------------
router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);

router.get(
  "/",
  validateRequest(listRecordsSchema, REQUEST_SOURCE.QUERY),
  listRecords,
);

router.post(
  "/:site_checkin_record_id/confirm",
  validateRequest(recordIdParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(confirmRejectSchema, REQUEST_SOURCE.BODY),
  confirmRecord,
);

router.post(
  "/:site_checkin_record_id/reject",
  validateRequest(recordIdParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(confirmRejectSchema, REQUEST_SOURCE.BODY),
  rejectRecord,
);

export default router;
