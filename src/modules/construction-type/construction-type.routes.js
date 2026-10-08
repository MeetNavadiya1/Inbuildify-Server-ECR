import express from "express";

const router = express.Router();

import {
  createConstructionType,
  getAllConstructionTypes,
  deleteConstructionType,
  updateConstructionType,
} from "./construction-type.controller.js";
import {
  createConstructiontyeSchema,
  getAllConstructionTypeSchema,
  deleteConstructionTypeSchema,
  updateConstructionTypeParamsSchema,
  updateConstructionTypeSchema,
} from "./construction-type.validation.js";
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
  validateRequest(createConstructiontyeSchema, REQUEST_SOURCE.BODY),
  createConstructionType,
);

router.get(
  "/",
  validateRequest(getAllConstructionTypeSchema, REQUEST_SOURCE.QUERY),
  getAllConstructionTypes,
);

router.put(
  "/:construction_type_id",
  validateRequest(updateConstructionTypeParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateConstructionTypeSchema, REQUEST_SOURCE.BODY),
  updateConstructionType,
);

router.delete(
  "/:construction_type_id",
  validateRequest(deleteConstructionTypeSchema, REQUEST_SOURCE.PARAMS),
  deleteConstructionType,
);

export default router;
