import express from "express";
import {
  createJobDelay,
  getJobDelays,
  getJobDelayById,
  updateJobDelay,
  deleteJobDelay,
} from "./job-delay.controller.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import {
  createJobDelaySchema,
  jobDelayParamsSchema,
  updateJobDelaySchema,
} from "./job-delay.validation.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

const router = express.Router();

router.use(authMiddleware);
router.use(roleMiddleware);

// POST /job-delay/:job_id - Create a job delay notice
router.post(
  "/:job_id",
  camelToSnakeMiddleware,
  validateRequest(createJobDelaySchema.params, REQUEST_SOURCE.PARAMS),
  validateRequest(createJobDelaySchema.body, REQUEST_SOURCE.BODY),
  createJobDelay,
);

// GET /job-delay/job/:job_id - List all delays for a specific job
router.get(
  "/job/:job_id",
  validateRequest(createJobDelaySchema.params, REQUEST_SOURCE.PARAMS),
  getJobDelays,
);

// GET /job-delay/:job_delay_id - Fetch details of a specific job delay
router.get(
  "/:job_delay_id",
  validateRequest(jobDelayParamsSchema, REQUEST_SOURCE.PARAMS),
  getJobDelayById,
);

// PUT /job-delay/:job_delay_id - Update a job delay notice
router.put(
  "/:job_delay_id",
  camelToSnakeMiddleware,
  validateRequest(updateJobDelaySchema.params, REQUEST_SOURCE.PARAMS),
  validateRequest(updateJobDelaySchema.body, REQUEST_SOURCE.BODY),
  updateJobDelay,
);

// DELETE /job-delay/:job_delay_id - Delete a job delay notice
router.delete(
  "/:job_delay_id",
  validateRequest(jobDelayParamsSchema, REQUEST_SOURCE.PARAMS),
  deleteJobDelay,
);

export default router;
