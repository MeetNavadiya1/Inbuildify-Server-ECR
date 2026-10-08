import express from "express";

const router = express.Router();

import {
  createJobInvoiceStagePayment,
  getAllJobInvoiceStagePayments,
  deleteJobInvoiceStagePayment,
  updateJobInvoiceStagePayment,
} from "./job-invoice-stage-payment.controller.js";
import {
  createJobInvoiceStagePaymentSchema,
  getAllJobInvoiceStagePaymentSchema,
  deleteJobInvoiceStagePaymentSchema,
  updateJobInvoiceStagePaymentParamsSchema,
  updateJobInvoiceStagePaymentSchema,
} from "./job-invoice-stage-payment.validation.js";
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
  validateRequest(createJobInvoiceStagePaymentSchema, REQUEST_SOURCE.BODY),
  createJobInvoiceStagePayment,
);

router.get(
  "/",
  validateRequest(getAllJobInvoiceStagePaymentSchema, REQUEST_SOURCE.QUERY),
  getAllJobInvoiceStagePayments,
);

router.delete(
  "/:id",
  validateRequest(deleteJobInvoiceStagePaymentSchema, REQUEST_SOURCE.PARAMS),
  deleteJobInvoiceStagePayment,
);

router.put(
  "/:job_invoice_stage_payment_id",
  validateRequest(
    updateJobInvoiceStagePaymentParamsSchema,
    REQUEST_SOURCE.PARAMS,
  ),
  validateRequest(updateJobInvoiceStagePaymentSchema, REQUEST_SOURCE.BODY),
  updateJobInvoiceStagePayment,
);

export default router;
