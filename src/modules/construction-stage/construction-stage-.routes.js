import express from "express";

const router = express.Router();

import {
  createConstructionStage,
  getAllConstructionStages,
  deleteConstructionStage,
  updateConstructionStage,
  reorderConstructionStages,
  initializeJobStages,
  getJobStages,
  updateJobStageStatus,
} from "./construction-stage.controller.js";
import {
  createConstructionStageSchema,
  getAllConstructionStageSchema,
  deleteConstructionStageSchema,
  updateConstructionStageParamsSchema,
  updateConstructionStageSchema,
  reorderConstructionStageSchema,
  jobIdParamSchema,
  getJobStagesQuerySchema,
  initializeJobStagesSchema,
  jobStageStatusParamSchema,
  updateJobStageStatusSchema,
} from "./construction-stage.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(camelToSnakeMiddleware);
router.use(authMiddleware);
router.use(roleMiddleware);

// ── Catalog: create ───────────────────────────────────────────────────────────
router.post(
  "/",
  validateRequest(createConstructionStageSchema, REQUEST_SOURCE.BODY),
  createConstructionStage,
);

// ── Catalog: reorder (specific route, before /:construction_stage) ─────────────
router.post(
  "/reorder",
  validateRequest(reorderConstructionStageSchema, REQUEST_SOURCE.BODY),
  reorderConstructionStages,
);

// ── Job-wise stage mapping ─────────────────────────────────────────────────────
// Query/params are NOT case-converted, so use snake_case query keys (e.g.
// ?workflow_type=CONSTRUCTION). JSON bodies ARE converted (send camelCase).
router.post(
  "/job/:jobId/initialize",
  validateRequest(jobIdParamSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(initializeJobStagesSchema, REQUEST_SOURCE.BODY),
  initializeJobStages,
);

router.get(
  "/job/:jobId",
  validateRequest(jobIdParamSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(getJobStagesQuerySchema, REQUEST_SOURCE.QUERY),
  getJobStages,
);

router.patch(
  "/job/:jobId/stage/:jobConstructionStageId/status",
  validateRequest(jobStageStatusParamSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateJobStageStatusSchema, REQUEST_SOURCE.BODY),
  updateJobStageStatus,
);

// ── Catalog: list (supports ?workflow_type=CONSTRUCTION|PRE_CONSTRUCTION) ───────
router.get(
  "/",
  validateRequest(getAllConstructionStageSchema, REQUEST_SOURCE.QUERY),
  getAllConstructionStages,
);

// ── Catalog: update / delete by id ─────────────────────────────────────────────
router.put(
  "/:construction_stage",
  validateRequest(updateConstructionStageParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateConstructionStageSchema, REQUEST_SOURCE.BODY),
  updateConstructionStage,
);

router.delete(
  "/:construction_stage",
  validateRequest(deleteConstructionStageSchema, REQUEST_SOURCE.PARAMS),
  deleteConstructionStage,
);

export default router;
