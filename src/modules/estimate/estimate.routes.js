import express from "express";

import {
  getEstimateConfig,
  calculateEstimate,
  checkFormula,
  loadStarterTemplate,
  createParameter,
  updateParameter,
  deleteParameter,
  createMaterial,
  updateMaterial,
  deleteMaterial,
  getJobEstimate,
  calculateJobEstimate,
  saveJobEstimateValues,
} from "./estimate.controller.js";
import {
  idParamsSchema,
  jobParamsSchema,
  saveJobValuesSchema,
  applyToExistingJobsQuerySchema,
  loadTemplateSchema,
  createParameterSchema,
  updateParameterSchema,
  createMaterialSchema,
  updateMaterialSchema,
  checkFormulaSchema,
  calculateSchema,
} from "./estimate.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";
import { scopeBuilder, requirePermission, MODULES, ACTIONS } from "../../middleware/rbac/index.js";

const router = express.Router();

// Estimation is configured in the admin console, so it rides on
// MODULES.SETTINGS: the roles that manage settings manage the estimate, and
// read-only settings roles (Admin Executive) can run it but not change it.
router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);
router.use(scopeBuilder);

const can = (action) => requirePermission(MODULES.SETTINGS, action);
// Estimating a job is job work, not settings work: a construction manager who
// can open a job can price it, without being able to change the formulas or
// rates it is priced with.
const canJob = (action) => requirePermission(MODULES.JOB, action);

router.get("/config", can(ACTIONS.READ), getEstimateConfig);

router.post(
  "/calculate",
  can(ACTIONS.READ),
  validateRequest(calculateSchema, REQUEST_SOURCE.BODY),
  calculateEstimate,
);

router.post(
  "/formula/check",
  can(ACTIONS.READ),
  validateRequest(checkFormulaSchema, REQUEST_SOURCE.BODY),
  checkFormula,
);

router.post(
  "/template",
  can(ACTIONS.CREATE),
  validateRequest(loadTemplateSchema, REQUEST_SOURCE.BODY),
  loadStarterTemplate,
);

// ─── Job-wise estimates ──────────────────────────────────────────────────────
// Job → Estimate & Dashboard. Same parameters, formulas and rates as above;
// the values they are priced with belong to the job in the path.

// The path says `:job_id`, not `:jobId`. camelToSnakeMiddleware rewrites
// `req.params`, but Express re-populates it when the ROUTE layer matches —
// after that middleware has run — so only the name written here survives.

router.get(
  "/jobs/:job_id",
  canJob(ACTIONS.READ),
  validateRequest(jobParamsSchema, REQUEST_SOURCE.PARAMS),
  getJobEstimate,
);

router.post(
  "/jobs/:job_id/calculate",
  canJob(ACTIONS.READ),
  validateRequest(jobParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(calculateSchema, REQUEST_SOURCE.BODY),
  calculateJobEstimate,
);

router.put(
  "/jobs/:job_id/values",
  canJob(ACTIONS.UPDATE),
  validateRequest(jobParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(saveJobValuesSchema, REQUEST_SOURCE.BODY),
  saveJobEstimateValues,
);

// ─── Parameters ──────────────────────────────────────────────────────────────

router.post(
  "/parameters",
  can(ACTIONS.CREATE),
  validateRequest(createParameterSchema, REQUEST_SOURCE.BODY),
  createParameter,
);

router.put(
  "/parameters/:id",
  can(ACTIONS.UPDATE),
  validateRequest(idParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateParameterSchema, REQUEST_SOURCE.BODY),
  updateParameter,
);

router.delete(
  "/parameters/:id",
  can(ACTIONS.DELETE),
  validateRequest(idParamsSchema, REQUEST_SOURCE.PARAMS),
  // "Apply changes to existing jobs?" rides in the query string here — a
  // DELETE has no body to carry it.
  validateRequest(applyToExistingJobsQuerySchema, REQUEST_SOURCE.QUERY),
  deleteParameter,
);

// ─── Materials ───────────────────────────────────────────────────────────────

router.post(
  "/materials",
  can(ACTIONS.CREATE),
  validateRequest(createMaterialSchema, REQUEST_SOURCE.BODY),
  createMaterial,
);

router.put(
  "/materials/:id",
  can(ACTIONS.UPDATE),
  validateRequest(idParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateMaterialSchema, REQUEST_SOURCE.BODY),
  updateMaterial,
);

router.delete(
  "/materials/:id",
  can(ACTIONS.DELETE),
  validateRequest(idParamsSchema, REQUEST_SOURCE.PARAMS),
  // "Apply changes to existing jobs?" rides in the query string here — a
  // DELETE has no body to carry it.
  validateRequest(applyToExistingJobsQuerySchema, REQUEST_SOURCE.QUERY),
  deleteMaterial,
);

export default router;
