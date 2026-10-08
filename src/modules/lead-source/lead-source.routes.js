import express from "express";

const router = express.Router();

import {
  createLeadSource,
  getLeadSources,
  getLeadSourceById,
  updateLeadSource,
  deleteLeadSource,
  updateLeadSourceIsActive,
} from "./lead-source.controller.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import {
  createLeadSourceSchema,
  getLeadResourcesSchema,
  getLeadSourceByIdSchema,
  updateLeadSourceParamsSchema,
  updateLeadSourceSchema,
  deleteLeadSourceSchema,
  updateLeadSourceIsActiveSchema,
} from "./leadSource.validation.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);

router.post(
  "/",
  validateRequest(createLeadSourceSchema, REQUEST_SOURCE.BODY),
  createLeadSource,
);
router.get(
  "/",
  validateRequest(getLeadResourcesSchema, REQUEST_SOURCE.QUERY),
  getLeadSources,
);
router.get(
  "/:lead_source_id",
  validateRequest(getLeadSourceByIdSchema, REQUEST_SOURCE.PARAMS),
  getLeadSourceById,
);
router.put(
  "/:lead_source_id",
  validateRequest(updateLeadSourceParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateLeadSourceSchema),
  updateLeadSource,
);
router.delete(
  "/:lead_source_id",
  validateRequest(deleteLeadSourceSchema, REQUEST_SOURCE.PARAMS),
  deleteLeadSource,
);

router.put(
  "/is-active/:lead_source_id",
  validateRequest(updateLeadSourceParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateLeadSourceIsActiveSchema, REQUEST_SOURCE.BODY),
  updateLeadSourceIsActive,
);

export default router;
