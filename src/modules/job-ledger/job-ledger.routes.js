import express from "express";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import { scopeBuilder, requirePermission, MODULES, ACTIONS } from "../../middleware/rbac/index.js";
import { REQUEST_SOURCE } from "../../config/constants.js";
import {
  createJobLedgerEntrySchema,
  updateJobLedgerEntrySchema,
  jobLedgerEntryParamsSchema,
  jobIdParamsSchema,
} from "./job-ledger.validation.js";
import {
  getJobLedger,
  createJobLedgerEntry,
  updateJobLedgerEntry,
  deleteJobLedgerEntry,
} from "./job-ledger.controller.js";

const router = express.Router();

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);
router.use(scopeBuilder);

// GET /job-ledger/job/:job_id — full ledger + finished totals for a job
router.get(
  "/job/:job_id",
  requirePermission(MODULES.JOB, ACTIONS.READ),
  validateRequest(jobIdParamsSchema, REQUEST_SOURCE.PARAMS),
  getJobLedger,
);

// POST /job-ledger — add a manual credit / debit (customer charge or expense)
router.post(
  "/",
  requirePermission(MODULES.INVOICE, ACTIONS.CREATE),
  validateRequest(createJobLedgerEntrySchema, REQUEST_SOURCE.BODY),
  createJobLedgerEntry,
);

// PUT /job-ledger/:job_ledger_entry_id — edit a manual entry
router.put(
  "/:job_ledger_entry_id",
  requirePermission(MODULES.INVOICE, ACTIONS.UPDATE),
  validateRequest(jobLedgerEntryParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateJobLedgerEntrySchema, REQUEST_SOURCE.BODY),
  updateJobLedgerEntry,
);

// DELETE /job-ledger/:job_ledger_entry_id — remove a manual entry
router.delete(
  "/:job_ledger_entry_id",
  requirePermission(MODULES.INVOICE, ACTIONS.DELETE),
  validateRequest(jobLedgerEntryParamsSchema, REQUEST_SOURCE.PARAMS),
  deleteJobLedgerEntry,
);

export default router;
