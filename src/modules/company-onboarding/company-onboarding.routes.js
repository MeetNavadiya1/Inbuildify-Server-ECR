import express from "express";

import {
  completeCompanyOnboarding,
  getSampleDataSummary,
  deleteSampleData,
  restoreSampleData,
  getSampleDataRequest,
  requestSampleData,
  syncSampleData,
  decideSampleDataRequest,
  getSampleDataRequestByToken,
  decideSampleDataRequestByToken,
} from "./company-onboarding.controller.js";
import {
  companyOnboardingParamsSchema,
  companyOnboardingBodySchema,
} from "./company-onboarding.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { createUpload, handleMulterError } from "../../utils/s3Upload.js";

const router = express.Router();

// ── Public (token-authenticated) ────────────────────────────────────────────
// Registered before the auth middleware: the Company Administrator opens these
// straight from the approval email, without logging in. The per-request token in
// the path is the credential and authorises exactly one decision.
router.get("/sample-data/approval/:token", getSampleDataRequestByToken);
router.post("/sample-data/approval/:token", decideSampleDataRequestByToken);

router.use(authMiddleware);
router.use(roleMiddleware);

const upload = createUpload("company");

// Phase 3 — onboarding details (logo, founder name, etc.) + flip flag to true.
router.patch(
  "/:id",
  upload.fields([
    { name: "companyLogo", maxCount: 1 },
    { name: "emailSignatureLogo", maxCount: 1 },
  ]),
  handleMulterError,
  (req, res, next) => {
    if (!req.body.address) {
      const address = {};
      for (const key in req.body) {
        const match = key.match(/^address\[(\w+)\]$/);
        if (match) {
          address[match[1]] = req.body[key];
          delete req.body[key];
        }
      }
      if (Object.keys(address).length > 0) req.body.address = address;
    }
    if (typeof req.body.address === "string") {
      try {
        req.body.address = JSON.parse(req.body.address);
      } catch {
        return res.status(400).json({ message: "Invalid address format" });
      }
    }
    next();
  },
  camelToSnakeMiddleware,
  validateRequest(companyOnboardingParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(companyOnboardingBodySchema, REQUEST_SOURCE.FORM_DATA),
  completeCompanyOnboarding,
);

// Settings → Sample Data. Both are scoped to the caller's own company/builder
// from the token, so there is no id in the path to tamper with.
router.get("/sample-data", getSampleDataSummary);

router.delete("/sample-data", deleteSampleData);

// Request → approval flow. Importing is no longer a direct action: a user raises
// a request, the Company Administrator is emailed, and the import runs on
// approval. Declared before "/sample-data/:anything" style routes would matter —
// these are all literal paths, so ordering is not load-bearing here.
router.get("/sample-data/request", getSampleDataRequest);

router.post("/sample-data/request", requestSampleData);

router.post("/sample-data/request/:id/decision", decideSampleDataRequest);

// Sync — top the existing sample data up with anything new in the demo account.
// It does not go through the approval flow because it only runs where sample
// data is already present (so it was approved), only for the Company
// Administrator, and it never deletes. The service re-checks both conditions.
router.post("/sample-data/sync", syncSampleData);

// Restore — bring this account's sample data back after it was deleted. Offered
// only where the summary says `canRestore`: the caller holds none AND a request
// for it was approved once. An account that still has its sample data is
// refused, so the UI must not call this while the summary reports any — Sync is
// what tops an existing set up. Rebuilding what somebody already approved is
// also what keeps this off the approval flow rather than around it: a first
// import still needs a request, and only the caller's own rows are ever touched.
router.post("/sample-data/restore", restoreSampleData);

export default router;
