import express from "express";

const router = express.Router();

import {
  createCustomFieldModule,
  getAllCustomFieldModule,
  deleteCustomFieldModule,
  updateCustomFieldModule,
} from "./custom-field-module.controller.js";
import {
  createCustomFieldModuleSchema,
  getAllCustomFieldModuleSchema,
  deleteCustomFieldModuleSchema,
  updateCustomFieldModuleIdParamsSchema,
  updateCustomFieldModuleSchema,
} from "./custom-field-module.validation.js";
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
  validateRequest(createCustomFieldModuleSchema, REQUEST_SOURCE.BODY),
  createCustomFieldModule,
);

router.get(
  "/",
  validateRequest(getAllCustomFieldModuleSchema, REQUEST_SOURCE.QUERY),
  getAllCustomFieldModule,
);

router.delete(
  "/:module_id",
  validateRequest(deleteCustomFieldModuleSchema, REQUEST_SOURCE.PARAMS),
  deleteCustomFieldModule,
);

router.put(
  "/:module_id",
  validateRequest(updateCustomFieldModuleIdParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateCustomFieldModuleSchema, REQUEST_SOURCE.BODY),
  updateCustomFieldModule,
);

export default router;
