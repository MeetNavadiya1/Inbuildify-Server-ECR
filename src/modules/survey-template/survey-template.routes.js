import express from "express";

const router = express.Router();

import {
  createSurveyTemplate,
  getAllSurveyTemplate,
  updateSurveyTemplate,
} from "./survey-template.controller.js";
import {
  createSurveyTemplateSchema,
  getAllSurveyTemplateSchema,
  updateSurveyTemplateParamsSchema,
  updateSurveyTemplateSchema,
} from "./survey-template.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);

router.post(
  "/",
  validateRequest(createSurveyTemplateSchema, REQUEST_SOURCE.BODY),
  createSurveyTemplate,
);

router.get(
  "/",
  validateRequest(getAllSurveyTemplateSchema, REQUEST_SOURCE.QUERY),
  getAllSurveyTemplate,
);

router.put(
  "/:survey_template_id",
  validateRequest(updateSurveyTemplateParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateSurveyTemplateSchema, REQUEST_SOURCE.BODY),
  updateSurveyTemplate,
);
export default router;
