import express from "express";

const router = express.Router();

import {
  createLeadLostReasonSchema,
  getAllLeadLostReasonsSchema,
  deleteLeadLostReasonSchema,
  updateLeadLostReasonSchema,
  updateLeadLostReasonParamsSchema,
  updateLeadLostReasonIsActiveSchema,
} from "./lead-lost-reason.validation.js";
import {
  createLeadLostReason,
  getAllLeadLostReasons,
  deleteLeadLostReason,
  updateLeadLostReason,
  updateLeadLostReasonIsActive,
} from "./lead-lost-reason.controller.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);

router.post(
  "/",
  validateRequest(createLeadLostReasonSchema, REQUEST_SOURCE.BODY),
  createLeadLostReason,
);

router.get(
  "/",
  validateRequest(getAllLeadLostReasonsSchema, REQUEST_SOURCE.QUERY),
  getAllLeadLostReasons,
);

router.delete(
  "/:id",
  validateRequest(deleteLeadLostReasonSchema, REQUEST_SOURCE.PARAMS),
  deleteLeadLostReason,
);

router.put(
  "/:id",
  validateRequest(updateLeadLostReasonParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateLeadLostReasonSchema, REQUEST_SOURCE.BODY),
  updateLeadLostReason,
);

router.put(
  "/is-active/:id",
  validateRequest(updateLeadLostReasonParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateLeadLostReasonIsActiveSchema, REQUEST_SOURCE.BODY),
  updateLeadLostReasonIsActive,
);

export default router;
