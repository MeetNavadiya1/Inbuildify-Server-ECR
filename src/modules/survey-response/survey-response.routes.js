import express from "express";

const router = express.Router();

import {
  sendSurvey,
  listSurveyResponses,
  getSurveyResponse,
  getPublicSurvey,
  submitPublicSurvey,
} from "./survey-response.controller.js";
import {
  sendSurveySchema,
  listSurveyResponsesSchema,
  surveyResponseIdParamsSchema,
  surveyTokenParamsSchema,
  submitSurveySchema,
} from "./survey-response.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

// ---------------------------------------------------------------------------
// Public routes — no auth. The recipient opens these via the tokenized link
// in their email. Must be registered BEFORE the auth middleware below.
// ---------------------------------------------------------------------------
router.get(
  "/public/:token",
  validateRequest(surveyTokenParamsSchema, REQUEST_SOURCE.PARAMS),
  getPublicSurvey,
);

router.post(
  "/public/:token/submit",
  camelToSnakeMiddleware,
  validateRequest(surveyTokenParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(submitSurveySchema, REQUEST_SOURCE.BODY),
  submitPublicSurvey,
);

// ---------------------------------------------------------------------------
// Authenticated routes (builder side)
// ---------------------------------------------------------------------------
router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);

router.post(
  "/send",
  validateRequest(sendSurveySchema, REQUEST_SOURCE.BODY),
  sendSurvey,
);

router.get(
  "/",
  validateRequest(listSurveyResponsesSchema, REQUEST_SOURCE.QUERY),
  listSurveyResponses,
);

router.get(
  "/:survey_response_id",
  validateRequest(surveyResponseIdParamsSchema, REQUEST_SOURCE.PARAMS),
  getSurveyResponse,
);

export default router;
