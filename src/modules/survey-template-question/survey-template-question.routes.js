import express from "express";

const router = express.Router();

import {
  createSurveyTemplateQuestion,
  getAllSurveyTemplateQuestions,
  deleteSurveyTemplateQuestion,
  updateSurveyTemplateQuestion,
} from "./survey-template-question.controller.js";
import {
  createSurveyQuestionSchema,
  getAllSurveyTemplateQuestionSchema,
  deleteSurveyTemplateQuestionSchema,
  updateSurveyTemplateQuestionParamsSchema,
  updateSurveyTemplateQuestionSchema,
} from "./survey-template-question.validation.js";
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
  validateRequest(createSurveyQuestionSchema, REQUEST_SOURCE.BODY),
  createSurveyTemplateQuestion,
);

router.get(
  "/",
  validateRequest(getAllSurveyTemplateQuestionSchema, REQUEST_SOURCE.QUERY),
  getAllSurveyTemplateQuestions,
);

router.delete(
  "/:survey_question_id",
  validateRequest(deleteSurveyTemplateQuestionSchema, REQUEST_SOURCE.PARAMS),
  deleteSurveyTemplateQuestion,
);

router.put(
  "/:survey_question_id",
  validateRequest(
    updateSurveyTemplateQuestionParamsSchema,
    REQUEST_SOURCE.PARAMS,
  ),
  validateRequest(updateSurveyTemplateQuestionSchema, REQUEST_SOURCE.BODY),
  updateSurveyTemplateQuestion,
);
export default router;
