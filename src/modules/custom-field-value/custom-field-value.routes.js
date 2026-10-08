import express from "express";

const router = express.Router();

import {
  createCustomFieldValue,
  getAllCustomFieldValue,
  deleteCustomFieldValue,
  updateCustomFieldValue,
} from "./custom-field-value.controller.js";
import {
  createCustomFieldValueSchema,
  getAllCustomFieldValueSchema,
  deleteCustomFieldValueSchema,
  updateCustomFieldValueIdParamsSchema,
  updateCustomFieldValueSchema,
} from "./custom-field-value.validation.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);

router.post(
  "/",
  validateRequest(createCustomFieldValueSchema, REQUEST_SOURCE.BODY),
  createCustomFieldValue,
);

router.get(
  "/",
  validateRequest(getAllCustomFieldValueSchema, REQUEST_SOURCE.QUERY),
  getAllCustomFieldValue,
);

router.delete(
  "/:custom_field_value_id",
  validateRequest(deleteCustomFieldValueSchema, REQUEST_SOURCE.PARAMS),
  deleteCustomFieldValue,
);

router.put(
  "/:custom_field_value_id",
  validateRequest(updateCustomFieldValueIdParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateCustomFieldValueSchema, REQUEST_SOURCE.BODY),
  updateCustomFieldValue,
);

export default router;
