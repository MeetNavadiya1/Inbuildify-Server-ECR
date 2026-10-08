import express from "express";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import parseFormDataJson from "../../middleware/parseFormDataJson.js";
import { scopeBuilder, requirePermission, MODULES, ACTIONS } from "../../middleware/rbac/index.js";
import { REQUEST_SOURCE } from "../../config/constants.js";
import { createPdfUpload, handleMulterError } from "../../utils/s3Upload.js";
import {
  createJobInvoiceSchema,
  updateJobInvoiceSchema,
  jobInvoiceParamsSchema,
  jobIdParamsSchema,
  sendJobInvoiceEmailSchema,
  createJobInvoicePaymentSchema,
  updateJobInvoicePaymentSchema,
  jobInvoicePaymentParamsSchema,
  sendJobInvoiceReceiptSchema,
  contractDatesParamsSchema,
  contractDatesBodySchema,
} from "./job-invoice.validation.js";
import {
  createJobInvoice,
  getJobInvoices,
  getJobInvoiceById,
  updateJobInvoice,
  deleteJobInvoice,
  getJobInvoiceSummary,
  sendJobInvoiceEmail,
  getJobInvoiceWorkflow,
  createJobInvoicePayment,
  getJobInvoicePayments,
  updateJobInvoicePayment,
  deleteJobInvoicePayment,
  sendJobInvoiceReceipt,
  saveContractDates,
  getContractDates,
} from "./job-invoice.controller.js";

const router = express.Router();

const upload = createPdfUpload("job-invoices");
const receiptUpload = createPdfUpload("job-invoice-receipts");

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);
router.use(scopeBuilder);

// ─── Invoice CRUD ─────────────────────────────────────────────────────────────

// POST /job-invoice — Create a new invoice for a job
router.post(
  "/",
  requirePermission(MODULES.INVOICE, ACTIONS.CREATE),
  validateRequest(createJobInvoiceSchema, REQUEST_SOURCE.BODY),
  createJobInvoice
);

// GET /job-invoice/job/:job_id — List all invoices for a job
router.get(
  "/job/:job_id",
  requirePermission(MODULES.INVOICE, ACTIONS.READ),
  validateRequest(jobIdParamsSchema, REQUEST_SOURCE.PARAMS),
  getJobInvoices
);

// GET /job-invoice/summary/:job_id — Stats: totalCost, invoiceGenerated, paymentReceived
router.get(
  "/summary/:job_id",
  requirePermission(MODULES.INVOICE, ACTIONS.READ),
  validateRequest(jobIdParamsSchema, REQUEST_SOURCE.PARAMS),
  getJobInvoiceSummary
);

// GET /job-invoice/:job_invoice_id — Single invoice detail
router.get(
  "/:job_invoice_id",
  requirePermission(MODULES.INVOICE, ACTIONS.READ),
  validateRequest(jobInvoiceParamsSchema, REQUEST_SOURCE.PARAMS),
  getJobInvoiceById
);

// PUT /job-invoice/:job_invoice_id — Update invoice
router.put(
  "/:job_invoice_id",
  requirePermission(MODULES.INVOICE, ACTIONS.UPDATE),
  validateRequest(jobInvoiceParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateJobInvoiceSchema, REQUEST_SOURCE.BODY),
  updateJobInvoice
);

// DELETE /job-invoice/:job_invoice_id — Delete invoice (DRAFT only)
router.delete(
  "/:job_invoice_id",
  requirePermission(MODULES.INVOICE, ACTIONS.DELETE),
  validateRequest(jobInvoiceParamsSchema, REQUEST_SOURCE.PARAMS),
  deleteJobInvoice
);

// ─── Invoice Email ────────────────────────────────────────────────────────────

// POST /job-invoice/:job_invoice_id/send — Send invoice via email
router.post(
  "/:job_invoice_id/send",
  requirePermission(MODULES.INVOICE, ACTIONS.UPDATE),
  validateRequest(jobInvoiceParamsSchema, REQUEST_SOURCE.PARAMS),
  upload.single("pdf"),
  handleMulterError,
  parseFormDataJson,
  camelToSnakeMiddleware,
  validateRequest(sendJobInvoiceEmailSchema, REQUEST_SOURCE.FORM_DATA),
  sendJobInvoiceEmail
);

// ─── Invoice Workflow ─────────────────────────────────────────────────────────

// GET /job-invoice/:job_invoice_id/workflow — Get workflow stage state
router.get(
  "/:job_invoice_id/workflow",
  requirePermission(MODULES.INVOICE, ACTIONS.READ),
  validateRequest(jobInvoiceParamsSchema, REQUEST_SOURCE.PARAMS),
  getJobInvoiceWorkflow
);

// ─── Payments ─────────────────────────────────────────────────────────────────

// POST /job-invoice/:job_invoice_id/payment — Record a payment
router.post(
  "/:job_invoice_id/payment",
  requirePermission(MODULES.INVOICE, ACTIONS.UPDATE),
  validateRequest(jobInvoiceParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(createJobInvoicePaymentSchema, REQUEST_SOURCE.BODY),
  createJobInvoicePayment
);

// GET /job-invoice/:job_invoice_id/payment — List all payments for an invoice
router.get(
  "/:job_invoice_id/payment",
  requirePermission(MODULES.INVOICE, ACTIONS.READ),
  validateRequest(jobInvoiceParamsSchema, REQUEST_SOURCE.PARAMS),
  getJobInvoicePayments
);

// PUT /job-invoice/:job_invoice_id/payment/:payment_id — Edit a payment
router.put(
  "/:job_invoice_id/payment/:payment_id",
  requirePermission(MODULES.INVOICE, ACTIONS.UPDATE),
  validateRequest(jobInvoicePaymentParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateJobInvoicePaymentSchema, REQUEST_SOURCE.BODY),
  updateJobInvoicePayment
);

// DELETE /job-invoice/:job_invoice_id/payment/:payment_id — Delete a payment
router.delete(
  "/:job_invoice_id/payment/:payment_id",
  requirePermission(MODULES.INVOICE, ACTIONS.DELETE),
  validateRequest(jobInvoicePaymentParamsSchema, REQUEST_SOURCE.PARAMS),
  deleteJobInvoicePayment
);

// ─── Receipt ──────────────────────────────────────────────────────────────────

// POST /job-invoice/:job_invoice_id/receipt — Send receipt email
router.post(
  "/:job_invoice_id/receipt",
  requirePermission(MODULES.INVOICE, ACTIONS.UPDATE),
  validateRequest(jobInvoiceParamsSchema, REQUEST_SOURCE.PARAMS),
  receiptUpload.single("pdf"),
  handleMulterError,
  parseFormDataJson,
  camelToSnakeMiddleware,
  validateRequest(sendJobInvoiceReceiptSchema, REQUEST_SOURCE.FORM_DATA),
  sendJobInvoiceReceipt
);

// ─── Contract Dates ───────────────────────────────────────────────────────────

// GET /job-invoice/contract-dates/:job_id — Get contract dates for a job
router.get(
  "/contract-dates/:job_id",
  requirePermission(MODULES.JOB, ACTIONS.READ),
  validateRequest(contractDatesParamsSchema, REQUEST_SOURCE.PARAMS),
  getContractDates
);

// PATCH /job-invoice/contract-dates/:job_id — Save contract dates
router.patch(
  "/contract-dates/:job_id",
  requirePermission(MODULES.JOB, ACTIONS.UPDATE),
  validateRequest(contractDatesParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(contractDatesBodySchema, REQUEST_SOURCE.BODY),
  saveContractDates
);

export default router;
