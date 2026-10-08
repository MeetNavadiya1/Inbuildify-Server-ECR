import express from "express";
import {
  getJobRoles,
  getAssignedJobRoles,
  saveJobRoles,
  assignJobRole,
  unassignJobRole,
} from "./job-role.controller.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import {
  jobParamsSchema,
  jobRoleParamsSchema,
  getJobRolesSchema,
  saveJobRolesSchema,
  assignJobRoleSchema,
} from "./job-role.validation.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

const router = express.Router();

router.use(authMiddleware);
router.use(roleMiddleware);

// GET /job-role/:job_id/assigned — only the roles that have a user on them.
// Declared before /:job_id so the two-segment path resolves correctly.
router.get(
  "/:job_id/assigned",
  validateRequest(jobParamsSchema, REQUEST_SOURCE.PARAMS),
  getAssignedJobRoles,
);

// GET /job-role/:job_id — everything the Assign Roles modal renders:
// each role, its eligible users, and who is currently assigned on this job.
// ?all=true widens the role list; ?without_users=true drops the dropdown data.
router.get(
  "/:job_id",
  validateRequest(getJobRolesSchema.params, REQUEST_SOURCE.PARAMS),
  validateRequest(getJobRolesSchema.query, REQUEST_SOURCE.QUERY),
  getJobRoles,
);

// PUT /job-role/:job_id — bulk save the modal (user_id: null clears a role).
router.put(
  "/:job_id",
  camelToSnakeMiddleware,
  validateRequest(saveJobRolesSchema.params, REQUEST_SOURCE.PARAMS),
  validateRequest(saveJobRolesSchema.body, REQUEST_SOURCE.BODY),
  saveJobRoles,
);

// POST /job-role/:job_id/:role_id — assign or reassign a single role.
router.post(
  "/:job_id/:role_id",
  camelToSnakeMiddleware,
  validateRequest(assignJobRoleSchema.params, REQUEST_SOURCE.PARAMS),
  validateRequest(assignJobRoleSchema.body, REQUEST_SOURCE.BODY),
  assignJobRole,
);

// DELETE /job-role/:job_id/:role_id — clear a single role.
router.delete(
  "/:job_id/:role_id",
  validateRequest(jobRoleParamsSchema, REQUEST_SOURCE.PARAMS),
  unassignJobRole,
);

export default router;
