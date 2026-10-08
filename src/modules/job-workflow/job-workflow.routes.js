import express from "express";

const router = express.Router();

import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";
import controller from "./job-workflow.controller.js";
import validation from "./job-workflow.validation.js";
import { createImageOrPdfUpload, handleMulterError } from "../../utils/s3Upload.js";
import { validateExternalToken } from "../../middleware/externalAuthMiddleware.js";

/* =========================================================
   PUBLIC — TASK EXTENSION RESPONSE

   Registered ABOVE the auth middleware below, which applies to every route
   after it. The recipient decides from the emailed link without an account, so
   these are guarded by the external token instead of a session.
========================================================= */

// The assignee's "Add Days" page, reached from the task assignment email.
router.get(
  "/tasks/:task_id/extension-public-details",
  validateExternalToken,
  validateRequest(validation.taskParamsSchema, REQUEST_SOURCE.PARAMS),
  controller.getTaskExtensionPublicDetails,
);

router.post(
  "/tasks/:task_id/extension-requests/public",
  validateExternalToken,
  camelToSnakeMiddleware,
  validateRequest(validation.taskParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(validation.createAssigneeExtensionRequestSchema, REQUEST_SOURCE.BODY),
  controller.createAssigneeExtensionRequest,
);

router.get(
  "/extension-requests/:request_id/public-details",
  validateExternalToken,
  validateRequest(validation.extensionRequestParamsSchema, REQUEST_SOURCE.PARAMS),
  controller.getExtensionRequestPublicDetails,
);

router.post(
  "/extension-requests/:request_id/respond",
  validateExternalToken,
  camelToSnakeMiddleware,
  validateRequest(validation.extensionRequestParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(validation.respondExtensionRequestSchema, REQUEST_SOURCE.BODY),
  controller.respondExtensionRequest,
);

router.use(authMiddleware);
router.use(roleMiddleware);

/* ================= SUB-STAGE (job-scoped) ================= */

router.get(
  "/jobs/:job_id/stages/:stage_id/sub-stages",
  validateRequest(validation.jobStageParamsSchema, REQUEST_SOURCE.PARAMS),
  controller.getSubStages,
);

router.post(
  "/jobs/:job_id/stages/:stage_id/sub-stages",
  camelToSnakeMiddleware,
  validateRequest(validation.jobStageParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(validation.createSubStageSchema, REQUEST_SOURCE.BODY),
  controller.createSubStage,
);

router.put(
  "/sub-stages/:sub_stage_id",
  camelToSnakeMiddleware,
  validateRequest(validation.subStageParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(validation.updateSubStageSchema, REQUEST_SOURCE.BODY),
  controller.updateSubStage,
);

router.delete(
  "/sub-stages/:sub_stage_id",
  camelToSnakeMiddleware,
  validateRequest(validation.subStageParamsSchema, REQUEST_SOURCE.PARAMS),
  controller.deleteSubStage,
);

/* ================= TASK (job-scoped) ================= */

router.post(
  "/sub-stages/:sub_stage_id/tasks",
  camelToSnakeMiddleware,
  validateRequest(validation.subStageParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(validation.createTaskSchema, REQUEST_SOURCE.BODY),
  controller.createTask,
);

router.get(
  "/sub-stages/:sub_stage_id/tasks",
  validateRequest(validation.subStageParamsSchema, REQUEST_SOURCE.PARAMS),
  controller.getTasks,
);

router.put(
  "/tasks/:task_id",
  camelToSnakeMiddleware,
  validateRequest(validation.taskParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(validation.updateTaskSchema, REQUEST_SOURCE.BODY),
  controller.updateTask,
);

router.delete(
  "/tasks/:task_id",
  validateRequest(validation.taskParamsSchema, REQUEST_SOURCE.PARAMS),
  controller.deleteTask,
);

// What the "Email assignee" mail panel opens with: recipient, saved templates,
// a draft subject/body, and the task's schedule.
router.get(
  "/tasks/:task_id/assignee-mail-context",
  validateRequest(validation.taskParamsSchema, REQUEST_SOURCE.PARAMS),
  controller.getAssigneeMailContext,
);

// Sends the composed message to the task's assignee.
router.post(
  "/tasks/:task_id/notify-assignee",
  camelToSnakeMiddleware,
  validateRequest(validation.taskParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(validation.notifyAssigneeSchema, REQUEST_SOURCE.BODY),
  controller.notifyTaskAssignee,
);

/* ================= TASK EXTENSION REQUEST (job-scoped) ================= */

// What the Request Extension modal needs: duration, the cap derived from it,
// selectable recipients, and any request already awaiting a response.
router.get(
  "/tasks/:task_id/extension-context",
  validateRequest(validation.taskParamsSchema, REQUEST_SOURCE.PARAMS),
  controller.getExtensionContext,
);

// Multipart: the reason/days/recipients ride alongside the attachments.
router.post(
  "/tasks/:task_id/extension-requests",
  createImageOrPdfUpload("task-extension-requests").array("files", 10),
  handleMulterError,
  camelToSnakeMiddleware,
  validateRequest(validation.taskParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(validation.createExtensionRequestSchema, REQUEST_SOURCE.BODY),
  controller.createExtensionRequest,
);

router.post(
  "/tasks/:task_id/attachments",
  createImageOrPdfUpload("job-workflow").single("file"),
  handleMulterError,
  camelToSnakeMiddleware,
  controller.uploadTaskAttachment,
);

router.delete(
  "/tasks/:task_id/attachments/:file_id",
  camelToSnakeMiddleware,
  controller.deleteTaskAttachment,
);

/* ================= TASK DEPENDENCY (job-scoped) ================= */

router.delete(
  "/task-dependencies",
  camelToSnakeMiddleware,
  validateRequest(validation.deleteTaskDependencySchema, REQUEST_SOURCE.BODY),
  controller.deleteTaskDependency,
);

/* ================= SUB-TASK (job-scoped) ================= */

router.post(
  "/tasks/:task_id/sub-tasks",
  camelToSnakeMiddleware,
  validateRequest(validation.taskParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(validation.createSubTaskSchema, REQUEST_SOURCE.BODY),
  controller.createSubTask,
);

router.get(
  "/tasks/:task_id/sub-tasks",
  camelToSnakeMiddleware,
  validateRequest(validation.taskParamsSchema, REQUEST_SOURCE.PARAMS),
  controller.getSubTasks,
);

router.put(
  "/sub-tasks/:sub_task_id",
  camelToSnakeMiddleware,
  validateRequest(validation.subTaskParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(validation.updateSubTaskSchema, REQUEST_SOURCE.BODY),
  controller.updateSubTask,
);

router.delete(
  "/sub-tasks/:sub_task_id",
  camelToSnakeMiddleware,
  validateRequest(validation.subTaskParamsSchema, REQUEST_SOURCE.PARAMS),
  controller.deleteSubTask,
);

/* ================= STAGE SYNC (job-scoped) ================= */

router.put(
  "/jobs/:job_id/stages/:stage_id/sync",
  camelToSnakeMiddleware,
  validateRequest(validation.jobStageParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(validation.stageSyncSchema, REQUEST_SOURCE.BODY),
  controller.setStageSync,
);

/* ================= INITIALIZE (job-scoped) ================= */

router.post(
  "/jobs/:job_id/initialize",
  validateRequest(validation.jobParamsSchema, REQUEST_SOURCE.PARAMS),
  controller.initializeJobWorkflow,
);

export default router;
