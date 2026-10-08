import express from "express";

const router = express.Router();

import {
  getAllSurveyor,
  updateSurveyor,
  createSurveyor,
  deleteSurveyor,
} from "./surveyor.controller.js";

import {
  createSurveyorSchema,
  getAllServeyorSchema,
  deleteSurveyorSchema,
  updateSurveyorIdParamsSchema,
  updateSurveyorSchema,
} from "./surveyor.validation.js";
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
  validateRequest(createSurveyorSchema, REQUEST_SOURCE.BODY),
  createSurveyor,
);

router.get(
  "/",
  validateRequest(getAllServeyorSchema, REQUEST_SOURCE.QUERY),
  getAllSurveyor,
);

router.delete(
  "/:surveyor_id",
  validateRequest(deleteSurveyorSchema, REQUEST_SOURCE.PARAMS),
  deleteSurveyor,
);

router.put(
  "/:surveyor_id",
  validateRequest(updateSurveyorIdParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateSurveyorSchema, REQUEST_SOURCE.BODY),
  updateSurveyor,
);
export default router;
