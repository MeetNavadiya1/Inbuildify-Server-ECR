import express from "express";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { scopeBuilder, requirePermission, MODULES, ACTIONS } from "../../middleware/rbac/index.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";
import {
  getBuildingContractParamsSchema,
  saveBuildingContractBodySchema,
  previewBuildingContractPdfParamsSchema,
} from "./building-contract.validation.js";
import { getByJobId, saveContract, previewPdf } from "./building-contract.controller.js";

const router = express.Router();

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(scopeBuilder);

// GET /building-contract/job/:job_id — load existing contract for a job
router.get(
  "/job/:job_id",
  requirePermission(MODULES.JOB, ACTIONS.READ),
  validateRequest(getBuildingContractParamsSchema, REQUEST_SOURCE.PARAMS),
  getByJobId,
);

// POST /building-contract/job/:job_id — create or update contract for a job
// Validation runs after camelToSnakeMiddleware, so the schema keys are the
// snake_case column names and the body schema doubles as the column whitelist
// for the service's `{ ...data }` spread.
router.post(
  "/job/:job_id",
  requirePermission(MODULES.JOB, ACTIONS.UPDATE),
  camelToSnakeMiddleware,
  validateRequest(getBuildingContractParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(saveBuildingContractBodySchema, REQUEST_SOURCE.BODY),
  saveContract,
);

// POST /building-contract/:building_contract_id/pdf — generate PDF and return presigned URL
router.post(
  "/:building_contract_id/pdf",
  requirePermission(MODULES.JOB, ACTIONS.READ),
  validateRequest(previewBuildingContractPdfParamsSchema, REQUEST_SOURCE.PARAMS),
  previewPdf,
);

export default router;
