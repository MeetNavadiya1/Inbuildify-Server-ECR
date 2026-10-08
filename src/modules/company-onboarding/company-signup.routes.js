import express from "express";

import { companySignUp } from "./company-onboarding.controller.js";
import { companySignUpSchema } from "./company-onboarding.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";

const router = express.Router();

// Phase 1 — dedicated company sign-up endpoint. Public; does NOT touch the
// generic /auth/register API.
router.post(
  "/",
  camelToSnakeMiddleware,
  validateRequest(companySignUpSchema, REQUEST_SOURCE.BODY),
  companySignUp,
);

export default router;
