import express from "express";

const router = express.Router();

import {
  updateSchedulerEmail,
  getSchedulerEmails,
  toggleSchedulerEmailStatus,
} from "./scheduler-email.controller.js";
import {
  getSchedulerEmailSchema,
  deleteSchedulerEmailSchema,
  updateSchedulerEmailParamsSchema,
  updateSchedulerEmailSchema,
} from "./scheduler-email.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { createUpload, handleMulterError } from "../../utils/s3Upload.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);

const upload = createUpload("scheduler-email");

router.get(
  "/",
  validateRequest(getSchedulerEmailSchema, REQUEST_SOURCE.QUERY),
  getSchedulerEmails,
);

router.put(
  "/:scheduler_email_id",
  upload.single("attachFiles"),
  handleMulterError,
  camelToSnakeMiddleware,
  validateRequest(updateSchedulerEmailParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateSchedulerEmailSchema, REQUEST_SOURCE.BODY),
  updateSchedulerEmail,
);

router.put(
  "/is-active/:scheduler_email_id",
  validateRequest(deleteSchedulerEmailSchema, REQUEST_SOURCE.PARAMS),
  toggleSchedulerEmailStatus,
);

export default router;
