import express from "express";

const router = express.Router();

import {
  getAllDwellingTypes,
  createDwellingType,
  updateDwellingType,
  deleteDwellingType,
  updateDwellingTypeActive,
} from "./dwelling-type.controller.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import {
  createDwellingTypeSchema,
  updateDwellingTypeSchema,
  deleteDwellingTypeSchema,
  updateDwellingTypeParamsScehma,
  updateDwellingTypeActiveSchema,
} from "./dwelling-type.validation.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);

router.get("/", getAllDwellingTypes);
router.post(
  "/",
  validateRequest(createDwellingTypeSchema, REQUEST_SOURCE.BODY),
  createDwellingType,
);
router.put(
  "/:dwelling_type_id",
  validateRequest(updateDwellingTypeSchema.params, REQUEST_SOURCE.PARAMS),
  validateRequest(updateDwellingTypeSchema.body, REQUEST_SOURCE.BODY),
  updateDwellingType,
);
router.delete(
  "/:dwelling_type_id",
  validateRequest(deleteDwellingTypeSchema.params, REQUEST_SOURCE.PARAMS),
  deleteDwellingType,
);
router.put(
  "/is-active/:dwelling_type_id",
  validateRequest(updateDwellingTypeParamsScehma, REQUEST_SOURCE.PARAMS),
  validateRequest(updateDwellingTypeActiveSchema, REQUEST_SOURCE.BODY),
  updateDwellingTypeActive,
);

export default router;
