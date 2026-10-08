import express from "express";

const router = express.Router();

import {
  getFields,
  createField,
  updateField,
  deleteField,
} from "./site-checkin.controller.js";
import {
  createFieldSchema,
  updateFieldSchema,
  fieldIdParamsSchema,
} from "./site-checkin.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

// All field-template routes are builder-side (authenticated).
router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);

router.get("/", getFields);

router.post(
  "/",
  validateRequest(createFieldSchema, REQUEST_SOURCE.BODY),
  createField,
);

router.put(
  "/:site_checkin_field_id",
  validateRequest(fieldIdParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateFieldSchema, REQUEST_SOURCE.BODY),
  updateField,
);

router.delete(
  "/:site_checkin_field_id",
  validateRequest(fieldIdParamsSchema, REQUEST_SOURCE.PARAMS),
  deleteField,
);

export default router;
