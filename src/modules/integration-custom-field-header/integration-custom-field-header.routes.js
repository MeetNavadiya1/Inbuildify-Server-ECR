import express from "express";

const router = express.Router();

import {
  createIntegrationCustomFieldHeader,
  getAllIntegrationCustomFieldHeader,
  deleteIntegrationCustomFieldHeader,
  updateIntegrationCustomFieldHeader,
} from "./integration-custom-field-header.controller.js";
import {
  createIntegrationCustomFieldHeaderSchema,
  getAllIntegrationCustomFieldHeaderSchema,
  deleteIntegrationCustomFieldHeaderSchema,
  updateIntegrationCustomFieldHeaderParamsSchema,
  updateIntegrationCustomFieldHeaderSchem,
} from "./integration-custom-field-header.validation.js";
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
  validateRequest(
    createIntegrationCustomFieldHeaderSchema,
    REQUEST_SOURCE.BODY,
  ),
  createIntegrationCustomFieldHeader,
);

router.get(
  "/",
  validateRequest(
    getAllIntegrationCustomFieldHeaderSchema,
    REQUEST_SOURCE.QUERY,
  ),
  getAllIntegrationCustomFieldHeader,
);

router.delete(
  "/:integration_custom_field_header_id",
  validateRequest(
    deleteIntegrationCustomFieldHeaderSchema,
    REQUEST_SOURCE.PARAMS,
  ),
  deleteIntegrationCustomFieldHeader,
);

router.put(
  "/:integration_custom_field_header_id",
  validateRequest(
    updateIntegrationCustomFieldHeaderParamsSchema,
    REQUEST_SOURCE.PARAMS,
  ),
  validateRequest(updateIntegrationCustomFieldHeaderSchem, REQUEST_SOURCE.BODY),
  updateIntegrationCustomFieldHeader,
);

export default router;
