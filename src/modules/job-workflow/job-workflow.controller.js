import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";

import workflowService from "./job-workflow.service.js";
import extensionService from "./job-task-extension.service.js";
import { getRoleNameById } from "../../helper/rbac.helper.js";

/**
 * Who is looking at the workflow. Drives the "Show all Tasks to all Roles"
 * setting: with it off, an operational role only sees tasks assigned to their
 * own role, plus unassigned ones and ones they created. The role name is
 * resolved too (from a cache, so this is not a per-request query) because
 * administrators are exempt from the filter — they own the workflow.
 */
async function viewerOf(req) {
  const roleId = req.user?.role_id || null;
  return {
    roleId,
    roleName: req.user?.role_name || (await getRoleNameById(roleId)),
    userId: req.user?.users_id || null,
  };
}

/* =========================================================
   SUB-STAGE (job-scoped)
========================================================= */

export async function getSubStages(req, res) {
  try {
    const { job_id: jobId, stage_id: stageId } = req.params;

    const subStages = await workflowService.getSubStages(jobId, stageId, await viewerOf(req));

    return successResponse(res, keysToCamelCase(subStages));
  } catch (err) {
    return errorResponse(res, 400, err.message);
  }
}

export async function createSubStage(req, res) {
  try {
    const { job_id: jobId, stage_id: stageId } = req.params;

    const subStage = await workflowService.createSubStage(jobId, stageId, req.body);

    return successResponse(res, keysToCamelCase(subStage), "Sub-stage created");
  } catch (err) {
    return errorResponse(res, 400, err.message);
  }
}

export async function updateSubStage(req, res) {
  try {
    const { builder_id: builderId, company_id: companyId } = req.user;

    const subStage = await workflowService.updateSubStage(
      req.params.sub_stage_id,
      req.body,
      builderId,
      companyId,
      req.user,
    );

    return successResponse(res, keysToCamelCase(subStage), "Sub-stage updated");
  } catch (err) {
    return errorResponse(res, 400, err.message);
  }
}

export async function deleteSubStage(req, res) {
  try {
    const { builder_id: builderId, company_id: companyId } = req.user;
    const { task_id: taskId } = req.body || {};

    await workflowService.deleteSubStage(
      req.params.sub_stage_id,
      builderId,
      companyId,
      taskId,
    );

    return successResponse(res, null, "Sub-stage deleted");
  } catch (err) {
    return errorResponse(res, 400, err.message);
  }
}

/* =========================================================
   TASK (job-scoped)
========================================================= */

export async function createTask(req, res) {
  try {
    const { builder_id: builderId, company_id: companyId } = req.user;

    const task = await workflowService.createTask(
      req.params.sub_stage_id,
      req.body,
      builderId,
      companyId,
      req.user,
    );

    return successResponse(res, keysToCamelCase(task), "Task created");
  } catch (err) {
    return errorResponse(res, 400, err.message);
  }
}

export async function getTasks(req, res) {
  try {
    const { builder_id: builderId, company_id: companyId } = req.user;

    const tasks = await workflowService.getTasks(
      req.params.sub_stage_id,
      builderId,
      companyId,
      await viewerOf(req),
    );

    return successResponse(res, tasks);
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

export async function updateTask(req, res) {
  try {
    const { builder_id: builderId, company_id: companyId } = req.user;

    const task = await workflowService.updateTask(
      req.params.task_id,
      req.body,
      builderId,
      companyId,
      req.user,
    );

    return successResponse(res, keysToCamelCase(task), "Task updated");
  } catch (err) {
    return errorResponse(res, 400, err.message);
  }
}

export async function deleteTask(req, res) {
  try {
    const { builder_id: builderId, company_id: companyId } = req.user;

    await workflowService.deleteTask(req.params.task_id, builderId, companyId);

    return successResponse(res, null, "Task deleted");
  } catch (err) {
    return errorResponse(res, 400, err.message);
  }
}

/* ============ TASK EXTENSION REQUESTS ============ */

export async function getExtensionContext(req, res) {
  try {
    const { builder_id: builderId, company_id: companyId } = req.user;

    const context = await extensionService.getExtensionContext(
      req.params.task_id,
      builderId,
      companyId,
      req.user,
    );

    return successResponse(res, keysToCamelCase(context), "Extension context fetched");
  } catch (err) {
    return errorResponse(res, 400, err.message);
  }
}

export async function createExtensionRequest(req, res) {
  try {
    const request = await extensionService.createExtensionRequest(
      req.params.task_id,
      req.body,
      req.files || [],
      req.user,
    );

    return successResponse(res, keysToCamelCase(request), "Extension request sent");
  } catch (err) {
    return errorResponse(res, 400, err.message);
  }
}

// Reached from the "Add Days" link in the task assignment email.
export async function getTaskExtensionPublicDetails(req, res) {
  try {
    const details = await extensionService.getTaskExtensionPublicDetails(req.params.task_id);
    return successResponse(res, keysToCamelCase(details), "Task extension details fetched");
  } catch (err) {
    return errorResponse(res, 400, err.message);
  }
}

export async function createAssigneeExtensionRequest(req, res) {
  try {
    const result = await extensionService.createAssigneeExtensionRequest(
      req.params.task_id,
      req.body,
    );
    return successResponse(
      res,
      keysToCamelCase(result),
      `${result.extension_days} days added — the task now runs for ${result.new_total_duration_days} days`,
    );
  } catch (err) {
    return errorResponse(res, 400, err.message);
  }
}

// Reached from the emailed link — token-secured, so there is no req.user.
export async function getExtensionRequestPublicDetails(req, res) {
  try {
    const details = await extensionService.getExtensionRequestPublicDetails(req.params.request_id);
    return successResponse(res, keysToCamelCase(details), "Extension request fetched");
  } catch (err) {
    return errorResponse(res, 400, err.message);
  }
}

export async function respondExtensionRequest(req, res) {
  try {
    const result = await extensionService.respondToExtensionRequest(req.params.request_id, req.body);
    return successResponse(
      res,
      keysToCamelCase(result),
      result.status === "APPROVED" ? "Extension approved" : "Extension rejected",
    );
  } catch (err) {
    return errorResponse(res, 400, err.message);
  }
}

export async function getAssigneeMailContext(req, res) {
  try {
    const { builder_id: builderId, company_id: companyId } = req.user;

    const context = await workflowService.getAssigneeMailContext(
      req.params.task_id,
      builderId,
      companyId,
      req.user,
    );

    return successResponse(res, keysToCamelCase(context), "Assignee mail context fetched");
  } catch (err) {
    return errorResponse(res, 400, err.message);
  }
}

export async function notifyTaskAssignee(req, res) {
  try {
    const { builder_id: builderId, company_id: companyId } = req.user;

    const result = await workflowService.notifyTaskAssignee(
      req.params.task_id,
      builderId,
      companyId,
      req.user,
      req.body || {},
    );

    return successResponse(res, keysToCamelCase(result), `Email sent to ${result.assignee_name}`);
  } catch (err) {
    return errorResponse(res, 400, err.message);
  }
}

export async function uploadTaskAttachment(req, res) {
  try {
    const { task_id: taskId } = req.params;
    const { job_id: jobId } = req.query;
    const file = req.file;
    const user = req.user;

    const attachment = await workflowService.uploadTaskAttachment(taskId, jobId, file, user);

    return successResponse(res, keysToCamelCase(attachment), "Attachment uploaded successfully", 201);
  } catch (err) {
    return errorResponse(res, 400, err.message);
  }
}

export async function deleteTaskAttachment(req, res) {
  try {
    const { task_id: taskId, file_id: fileId } = req.params;
    const { company_id: companyId } = req.user;

    const remainingAttachments = await workflowService.deleteTaskAttachment(taskId, fileId, companyId);

    return successResponse(res, keysToCamelCase(remainingAttachments), "Attachment deleted successfully");
  } catch (err) {
    return errorResponse(res, 400, err.message);
  }
}

/* =========================================================
   SUB-TASK (job-scoped)
========================================================= */

export async function createSubTask(req, res) {
  try {
    const { builder_id: builderId, company_id: companyId } = req.user;

    const subTask = await workflowService.createSubTask(
      req.params.task_id,
      req.body,
      builderId,
      companyId,
    );

    return successResponse(res, keysToCamelCase(subTask), "Sub-task created");
  } catch (err) {
    return errorResponse(res, 400, err.message);
  }
}

export async function getSubTasks(req, res) {
  try {
    const { builder_id: builderId, company_id: companyId } = req.user;

    const subTasks = await workflowService.getSubTasks(
      req.params.task_id,
      builderId,
      companyId,
    );

    return successResponse(res, keysToCamelCase(subTasks));
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

export async function updateSubTask(req, res) {
  try {
    const { builder_id: builderId, company_id: companyId } = req.user;

    const subTask = await workflowService.updateSubTask(
      req.params.sub_task_id,
      req.body,
      builderId,
      companyId,
    );

    return successResponse(res, keysToCamelCase(subTask), "Sub-task updated");
  } catch (err) {
    return errorResponse(res, 400, err.message);
  }
}

export async function deleteSubTask(req, res) {
  try {
    const { builder_id: builderId, company_id: companyId } = req.user;

    await workflowService.deleteSubTask(req.params.sub_task_id, builderId, companyId);

    return successResponse(res, null, "Sub-task deleted");
  } catch (err) {
    return errorResponse(res, 400, err.message);
  }
}

/* =========================================================
   TASK DEPENDENCY (job-scoped)
========================================================= */

export async function deleteTaskDependency(req, res) {
  try {
    const { builder_id: builderId, company_id: companyId } = req.user;

    await workflowService.deleteTaskDependency(
      req.body.task_id,
      req.body.predecessor_task_id,
      builderId,
      companyId,
    );

    return successResponse(res, null, "Task dependency deleted successfully.");
  } catch (err) {
    return errorResponse(res, 400, err.message);
  }
}

/* =========================================================
   INITIALIZE (job-scoped)
========================================================= */

export async function initializeJobWorkflow(req, res) {
  try {
    const { job_id: jobId } = req.params;
    const { builder_id: builderId, company_id: companyId } = req.user;

    await workflowService.initializeJobWorkflow(jobId, builderId, companyId);

    return successResponse(res, null, "Job workflow initialized");
  } catch (err) {
    return errorResponse(res, 400, err.message);
  }
}

/* =========================================================
   STAGE SYNC (job-scoped)
========================================================= */

export async function setStageSync(req, res) {
  try {
    const { job_id: jobId, stage_id: stageId } = req.params;
    const { is_synced: isSynced } = req.body;
    const { builder_id: builderId, company_id: companyId } = req.user;

    const result = await workflowService.setStageSync(
      jobId,
      stageId,
      isSynced,
      builderId,
      companyId,
      await viewerOf(req),
    );

    return successResponse(
      res,
      keysToCamelCase(result),
      isSynced ? "Stage synced" : "Stage un-synced",
    );
  } catch (err) {
    return errorResponse(res, 400, err.message);
  }
}

export default {
  getSubStages,
  createSubStage,
  updateSubStage,
  deleteSubStage,
  createTask,
  getTasks,
  updateTask,
  deleteTask,
  getAssigneeMailContext,
  notifyTaskAssignee,
  getExtensionContext,
  createExtensionRequest,
  getTaskExtensionPublicDetails,
  createAssigneeExtensionRequest,
  getExtensionRequestPublicDetails,
  respondExtensionRequest,
  uploadTaskAttachment,
  deleteTaskAttachment,
  createSubTask,
  getSubTasks,
  updateSubTask,
  deleteSubTask,
  deleteTaskDependency,
  initializeJobWorkflow,
  setStageSync,
};
