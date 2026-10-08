import express from "express";

const router = express.Router();

import {
  createJobInvoiceSetting,
  updateJobInvoiceSetting,
  getUserJobInvoiceSettings,
} from "./job-invoice-setting.controller.js";
import {
  createJobInvocieSettingSchema,
  updateJobInvoiceSettingParamsSchema,
  updateJobInvoiceSettingSchema,
} from "./job-invoice-setting.validation.js";
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
  validateRequest(createJobInvocieSettingSchema, REQUEST_SOURCE.BODY),
  createJobInvoiceSetting,
);

router.get("/", getUserJobInvoiceSettings);

router.put(
  "/",
  validateRequest(updateJobInvoiceSettingSchema, REQUEST_SOURCE.BODY),
  updateJobInvoiceSetting,
);

export default router;
