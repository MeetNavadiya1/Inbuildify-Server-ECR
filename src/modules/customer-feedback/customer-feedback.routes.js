import express from "express";
import {
  createCustomerFeedback,
  getCustomerFeedbackList,
  updateCustomerFeedback,
  deleteCustomerFeedback,
} from "./customer-feedback.controller.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";
import {
  createFeedbackSchema,
  getFeedbackListSchema,
  updateFeedbackSchema,
  deleteFeedbackSchema,
} from "./customer-feedback.validation.js";

const router = express.Router();

router.use(authMiddleware);
router.use(roleMiddleware);

// POST /customer-feedback/:job_id — request feedback
router.post(
  "/:job_id",
  validateRequest(createFeedbackSchema.params, REQUEST_SOURCE.PARAMS),
  validateRequest(createFeedbackSchema.body, REQUEST_SOURCE.BODY),
  createCustomerFeedback
);

// GET /customer-feedback/:job_id — get feedback list for a job
router.get(
  "/:job_id",
  validateRequest(getFeedbackListSchema.params, REQUEST_SOURCE.PARAMS),
  getCustomerFeedbackList
);

// PATCH /customer-feedback/:feedback_id — update feedback (e.g. submit comments/status)
router.patch(
  "/:feedback_id",
  validateRequest(updateFeedbackSchema.params, REQUEST_SOURCE.PARAMS),
  validateRequest(updateFeedbackSchema.body, REQUEST_SOURCE.BODY),
  updateCustomerFeedback
);

// DELETE /customer-feedback/:feedback_id — delete feedback entry
router.delete(
  "/:feedback_id",
  validateRequest(deleteFeedbackSchema.params, REQUEST_SOURCE.PARAMS),
  deleteCustomerFeedback
);

export default router;

