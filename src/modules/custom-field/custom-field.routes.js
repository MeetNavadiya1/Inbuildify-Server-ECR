import express from "express";

const router = express.Router();

import {
  createCustomField,
  getAllCustomFields,
  deleteCustomField,
  updateCustomField,
  updateCustomFieldIsActive,
  createOption,
  deleteOption,
} from "./custom-field.controller.js";
import {
  createCustomFieldSchema,
  getAllCustomFieldSchema,
  deleteCustomFieldSchema,
  updateCustomFieldIdParamsSchema,
  updateCustomFieldSchema,
  updateCustomFieldIsActiveSchema,
  createOptionSchema,
  deleteOptionParamsSchema,
  deleteOptionSchema,
} from "./custom-field.validation.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);

router.get(
  "/",
  validateRequest(getAllCustomFieldSchema, REQUEST_SOURCE.QUERY),
  getAllCustomFields,
);

router.post(
  "/",
  validateRequest(createCustomFieldSchema, REQUEST_SOURCE.BODY),
  createCustomField,
);
router.put(
  "/:id",
  validateRequest(updateCustomFieldIdParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateCustomFieldSchema, REQUEST_SOURCE.BODY),
  updateCustomField,
);

router.delete(
  "/:id",
  validateRequest(deleteCustomFieldSchema, REQUEST_SOURCE.PARAMS),
  deleteCustomField,
);

router.put(
  "/is-active/:id",
  validateRequest(updateCustomFieldIdParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateCustomFieldIsActiveSchema, REQUEST_SOURCE.BODY),
  updateCustomFieldIsActive,
);

router.post(
  "/option",
  validateRequest(createOptionSchema, REQUEST_SOURCE.BODY),
  createOption,
);

router.delete(
  "/option/:custom_field_id",
  validateRequest(deleteOptionParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(deleteOptionSchema, REQUEST_SOURCE.BODY),
  deleteOption,
);

export default router;
