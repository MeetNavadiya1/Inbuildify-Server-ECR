import express from "express";
import {
  createDailyUpdate,
  getJobDailyUpdates,
  updateDailyUpdate,
  deleteDailyUpdate,
  getMyDailyUpdates,
} from "./job-daily-update.controller.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import { scopeBuilder, requirePermission, MODULES, ACTIONS } from "../../middleware/rbac/index.js";
import { createImageUpload, handleMulterError } from "../../utils/s3Upload.js";
import {
  jobIdParamsSchema,
  dailyUpdateParamsSchema,
  createDailyUpdateBodySchema,
  updateDailyUpdateBodySchema,
  listDailyUpdatesQuerySchema,
  myDailyUpdatesQuerySchema,
} from "./job-daily-update.validation.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

const router = express.Router();

// Photos stream straight to S3; the service records each as a DriveFile under
// reference_type = JobDailyUpdateImage.
const imageUpload = createImageUpload("job/daily-updates");
const MAX_IMAGES_PER_REQUEST = 10;

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(scopeBuilder);

// ── Contact self-service ─────────────────────────────────────────────────────
// GET /job-daily-update/my?jobId=&from=&to= — the homebuyer's dashboard feed.
// Not gated by requirePermission(JOB), for the same reason as
// /job/my/tracking/colours: the Contact role has no JOB permission, and the
// service pins every row to job.customer_contact_id = self. Declared before the
// ":job_daily_update_id" routes so "my" is never read as an id.
router.get(
  "/my",
  camelToSnakeMiddleware,
  validateRequest(myDailyUpdatesQuerySchema, REQUEST_SOURCE.QUERY),
  getMyDailyUpdates,
);

// ── Builder side ─────────────────────────────────────────────────────────────
// Posting is a job write (Builder, Construction Manager, and a Site Supervisor
// on the jobs they supervise); reading follows JOB read.

// POST /job-daily-update/job/:job_id — submit a daily update (multipart, photos in `images`)
router.post(
  "/job/:job_id",
  requirePermission(MODULES.JOB, ACTIONS.UPDATE),
  validateRequest(jobIdParamsSchema, REQUEST_SOURCE.PARAMS),
  imageUpload.array("images", MAX_IMAGES_PER_REQUEST),
  handleMulterError,
  camelToSnakeMiddleware,
  validateRequest(createDailyUpdateBodySchema, REQUEST_SOURCE.FORM_DATA),
  createDailyUpdate,
);

// GET /job-daily-update/job/:job_id?from=&to=&page=&limit= — list a job's updates
router.get(
  "/job/:job_id",
  requirePermission(MODULES.JOB, ACTIONS.READ),
  validateRequest(jobIdParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(listDailyUpdatesQuerySchema, REQUEST_SOURCE.QUERY),
  getJobDailyUpdates,
);

// PUT /job-daily-update/:job_daily_update_id — edit text, add photos, remove photos (removeImageIds)
router.put(
  "/:job_daily_update_id",
  requirePermission(MODULES.JOB, ACTIONS.UPDATE),
  validateRequest(dailyUpdateParamsSchema, REQUEST_SOURCE.PARAMS),
  imageUpload.array("images", MAX_IMAGES_PER_REQUEST),
  handleMulterError,
  camelToSnakeMiddleware,
  validateRequest(updateDailyUpdateBodySchema, REQUEST_SOURCE.FORM_DATA),
  updateDailyUpdate,
);

// DELETE /job-daily-update/:job_daily_update_id — remove an update and its photos
router.delete(
  "/:job_daily_update_id",
  requirePermission(MODULES.JOB, ACTIONS.UPDATE),
  validateRequest(dailyUpdateParamsSchema, REQUEST_SOURCE.PARAMS),
  deleteDailyUpdate,
);

export default router;
