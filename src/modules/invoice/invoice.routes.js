import express from "express";

const router = express.Router();

import {
  createInvoice,
  getInvoicesByLead,
  getInvoiceById,
  updateInvoice,
  deleteInvoice,
} from "./invoice.controller.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import {
  createInvoiceSchema,
  getInvoiceByIdSchema,
  getInvoicesByLeadSchema,
  updateInvoiceSchema,
} from "./invoice.validation.js";
import {
  scopeBuilder,
  requirePermission,
  MODULES,
  ACTIONS,
} from "../../middleware/rbac/index.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);
router.use(scopeBuilder);

router.post(
  "/",
  requirePermission(MODULES.INVOICE, ACTIONS.CREATE),
  validateRequest(createInvoiceSchema, REQUEST_SOURCE.BODY),
  createInvoice,
);

router.get(
  "/lead/:leads_id",
  requirePermission(MODULES.INVOICE, ACTIONS.READ),
  validateRequest(getInvoicesByLeadSchema, REQUEST_SOURCE.PARAMS),
  getInvoicesByLead,
);

router.get(
  "/:invoice_id",
  requirePermission(MODULES.INVOICE, ACTIONS.READ),
  validateRequest(getInvoiceByIdSchema, REQUEST_SOURCE.PARAMS),
  getInvoiceById,
);

router.put(
  "/:invoice_id",
  requirePermission(MODULES.INVOICE, ACTIONS.UPDATE),
  validateRequest(getInvoiceByIdSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateInvoiceSchema, REQUEST_SOURCE.BODY),
  updateInvoice,
);

router.delete(
  "/:invoice_id",
  requirePermission(MODULES.INVOICE, ACTIONS.DELETE),
  validateRequest(getInvoiceByIdSchema, REQUEST_SOURCE.PARAMS),
  deleteInvoice,
);

export default router;
