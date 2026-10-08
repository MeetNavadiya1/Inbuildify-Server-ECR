import express from "express";

const router = express.Router();

import {
  createSms,
  getAllSms,
  getSmsById,
  updateSms,
  deleteSms,
} from "./sms.controller.js";
import {
  createSmsSchema,
  updateSmsSchema,
  getAllSmsSchema,
  smsParamsSchema,
} from "./sms.validation.js";
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
  validateRequest(createSmsSchema, REQUEST_SOURCE.BODY),
  createSms,
);

router.get(
  "/",
  validateRequest(getAllSmsSchema, REQUEST_SOURCE.QUERY),
  getAllSms,
);

router.get("/:sms_id", getSmsById);

router.put(
  "/:sms_id",
  validateRequest(smsParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateSmsSchema, REQUEST_SOURCE.BODY),
  updateSms,
);

router.delete(
  "/:sms_id",
  validateRequest(smsParamsSchema, REQUEST_SOURCE.PARAMS),
  deleteSms,
);

export default router;
