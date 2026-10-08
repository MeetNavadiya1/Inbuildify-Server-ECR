import express from "express";

const router = express.Router();

import { createJobColorColumn, getAllJobColorColumns, updateJobColorColumn } from "./job-color-column.controller.js";
import {
  createJobColorCoulmnSchema,
  getJobColorColumnSchema,
  updateJobColorColumnParamsSchema,
  updateJobColorColumnSchema,
} from "./job-color-column.validation.js";
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
  validateRequest(createJobColorCoulmnSchema, REQUEST_SOURCE.BODY),
  createJobColorColumn,
);

router.get(
  "/",
  validateRequest(getJobColorColumnSchema, REQUEST_SOURCE.QUERY),
  getAllJobColorColumns,
);

router.put(
  "/:id",
  validateRequest(updateJobColorColumnParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateJobColorColumnSchema, REQUEST_SOURCE.BODY),
  updateJobColorColumn,
);
export default router;
