import express from "express";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { scopeBuilder, requirePermission, MODULES, ACTIONS } from "../../middleware/rbac/index.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";
import {
  getJobChecklist,
  getChecklistTemplates,
  addJobChecklistItem,
  applyChecklistTemplate,
  updateJobChecklistItem,
  setJobChecklistItemResponse,
  deleteJobChecklistItem,
} from "./job-checklist.controller.js";
import {
  jobParamsSchema,
  itemParamsSchema,
  listQuerySchema,
  addItemSchema,
  applyTemplateSchema,
  updateItemSchema,
  setResponseSchema,
} from "./job-checklist.validation.js";

const router = express.Router();

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(scopeBuilder);
router.use(camelToSnakeMiddleware);

// Master checklists available to apply. Declared before /:job_id so "templates"
// is not swallowed by the job-id route.
router.get("/templates", requirePermission(MODULES.JOB, ACTIONS.READ), getChecklistTemplates);

// GET /job-checklist/:job_id?status=all|pending|completed
router.get(
  "/:job_id",
  requirePermission(MODULES.JOB, ACTIONS.READ),
  validateRequest(jobParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(listQuerySchema, REQUEST_SOURCE.QUERY),
  getJobChecklist,
);

// POST /job-checklist/:job_id — add one ad-hoc item (the drawer's "+ Checklist")
router.post(
  "/:job_id",
  requirePermission(MODULES.JOB, ACTIONS.UPDATE),
  validateRequest(jobParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(addItemSchema, REQUEST_SOURCE.BODY),
  addJobChecklistItem,
);

// POST /job-checklist/:job_id/apply — copy a master checklist onto the job
router.post(
  "/:job_id/apply",
  requirePermission(MODULES.JOB, ACTIONS.UPDATE),
  validateRequest(jobParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(applyTemplateSchema, REQUEST_SOURCE.BODY),
  applyChecklistTemplate,
);

// PATCH /job-checklist/item/:item_id — edit the line itself
router.patch(
  "/item/:item_id",
  requirePermission(MODULES.JOB, ACTIONS.UPDATE),
  validateRequest(itemParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateItemSchema, REQUEST_SOURCE.BODY),
  updateJobChecklistItem,
);

// PATCH /job-checklist/item/:item_id/response — tick it / pick Yes-No-N/A / note
router.patch(
  "/item/:item_id/response",
  requirePermission(MODULES.JOB, ACTIONS.UPDATE),
  validateRequest(itemParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(setResponseSchema, REQUEST_SOURCE.BODY),
  setJobChecklistItemResponse,
);

router.delete(
  "/item/:item_id",
  requirePermission(MODULES.JOB, ACTIONS.DELETE),
  validateRequest(itemParamsSchema, REQUEST_SOURCE.PARAMS),
  deleteJobChecklistItem,
);

export default router;
