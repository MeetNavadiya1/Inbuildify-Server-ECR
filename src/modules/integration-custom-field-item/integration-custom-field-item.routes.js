import express from "express";

const router = express.Router();

import {
  createIntegrationCustomFieldItem,
  getAllIntegrationCustomFieldItem,
  deleteIntegrationCustomFieldItem,
  updateIntegrationCustomFieldItem,
} from "./integration-custom-field-item.controller.js";
import {
  createIntegrationCustomFieldItemSchema,
  getAllIntegrationCustomFieldItemSchema,
  deleteIntegrationCustomFieldItemSchema,
  updateIntegrationCustomFieldParamsSchema,
  updateIntegrationCustoFieldItemSchema,
} from "./integration-custom-field-item.validation.js";
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
  validateRequest(createIntegrationCustomFieldItemSchema, REQUEST_SOURCE.BODY),
  createIntegrationCustomFieldItem,
);

router.get(
  "/",
  validateRequest(getAllIntegrationCustomFieldItemSchema, REQUEST_SOURCE.QUERY),
  getAllIntegrationCustomFieldItem,
);

router.delete(
  "/:integration_custom_field_item_id",
  validateRequest(
    deleteIntegrationCustomFieldItemSchema,
    REQUEST_SOURCE.PARAMS,
  ),
  deleteIntegrationCustomFieldItem,
);

router.put(
  "/:integration_custom_field_item_id",
  validateRequest(
    updateIntegrationCustomFieldParamsSchema,
    REQUEST_SOURCE.PARAMS,
  ),
  validateRequest(updateIntegrationCustoFieldItemSchema, REQUEST_SOURCE.BODY),
  updateIntegrationCustomFieldItem,
);

export default router;
