import express from "express";

const router = express.Router();

import {
  createJobForm,
  getAllJobForms,
  getJobFormById,
  updateJobForm,
  deleteJobForm,
} from "./job-form.controller.js";
import {
  createJobFormSchema,
  updateJobFormSchema,
  getJobFormByIdSchema,
  deleteJobFormSchema,
  getAllJobFormsSchema,
  updateJobFormParamsSchema,
} from "./job-form.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.post(
  "/",
  authMiddleware,
  roleMiddleware,
  camelToSnakeMiddleware,
  validateRequest(createJobFormSchema, REQUEST_SOURCE.BODY),
  createJobForm,
);

router.get(
  "/",
  authMiddleware,
  roleMiddleware,
  validateRequest(getAllJobFormsSchema, REQUEST_SOURCE.QUERY),
  getAllJobForms,
);

router.get(
  "/:leads_id",
  authMiddleware,
  roleMiddleware,
  validateRequest(getJobFormByIdSchema, REQUEST_SOURCE.PARAMS),
  getJobFormById,
);

router.put(
  "/:job_form_id",
  authMiddleware,
  roleMiddleware,
  camelToSnakeMiddleware,
  validateRequest(updateJobFormParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateJobFormSchema, REQUEST_SOURCE.BODY),
  updateJobForm,
);

router.delete(
  "/:job_form_id",
  authMiddleware,
  roleMiddleware,
  validateRequest(deleteJobFormSchema, REQUEST_SOURCE.PARAMS),
  deleteJobForm,
);

export default router;
