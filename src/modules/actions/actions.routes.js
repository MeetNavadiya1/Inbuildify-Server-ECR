import express from "express";

const router = express.Router();

import {
  createAction,
  getActions,
  updateAction,
  deleteAction,
} from "./actions.controller.js";
import {
  createActionParamsSchema,
  createActionBodySchema,
  getActionsParamsSchema,
  getActionsQuerySchema,
  updateActionParamsSchema,
  updateActionBodySchema,
  deleteActionParamsSchema,
} from "./actions.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";
import { createUpload, handleMulterError } from "../../utils/s3Upload.js";

router.use(authMiddleware);
router.use(roleMiddleware);

const upload = createUpload("action");

// Create action for a lead
router.post(
  "/:leads_id",
  upload.fields([{ name: "attachFile", maxCount: 1 }]),
  handleMulterError,
  camelToSnakeMiddleware,
  validateRequest(createActionParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(createActionBodySchema, REQUEST_SOURCE.FORM_DATA),
  createAction,
);

// Get actions for a lead
router.get(
  "/:leads_id",
  validateRequest(getActionsParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(getActionsQuerySchema, REQUEST_SOURCE.QUERY),
  getActions,
);

// Update an action
router.put(
  "/:action_id",
  upload.fields([{ name: "attachFile", maxCount: 1 }]),
  handleMulterError,
  camelToSnakeMiddleware,
  validateRequest(updateActionParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateActionBodySchema, REQUEST_SOURCE.FORM_DATA),
  updateAction,
);

// Delete an action
router.delete(
  "/:action_id",
  validateRequest(deleteActionParamsSchema, REQUEST_SOURCE.PARAMS),
  deleteAction,
);

export default router;
