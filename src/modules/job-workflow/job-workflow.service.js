/**
 * JOB WORKFLOW SERVICE
 *
 * Job-scoped facade for a single job's workflow instance (its own copy of the
 * sub-stages / tasks / subtasks / dependencies that live in the job_* tables).
 *
 * The heavy lifting — cloning templates, sort-order rebalancing, ownership
 * checks, attachments — already lives in the shared job-process services, which
 * route to the correct table family by id. This module is the job-instance
 * public API: list/create are explicitly job-scoped (they pass the jobId), and
 * the id-based mutations operate on the job_* rows the list/create produced.
 *
 * Template (global) configuration stays in the job-process module; this module
 * is exclusively about a job's own workflow.
 */
import stageService from "../job-process/job-process-stage.service.js";
import taskService from "../job-process/job-process-task.service.js";
import {
  resolveBySubStageId,
  resolveByTaskId,
  resolveBySubtaskId,
} from "../job-process/job-process-table-router.js";

/* ===================== SUB-STAGES ===================== */

/**
 * List a job's sub-stages for a workflow stage. Lazily clones the templates into
 * the job tables on first access, refreshes the estimated-date schedule, and
 * narrows the task list to the viewer's role when "Show all Tasks to all Roles"
 * is off.
 */
export function getSubStages(jobId, stageId, viewer = null) {
  return stageService.getSubStages(stageId, jobId, viewer);
}

/** Create a sub-stage on a job's workflow stage. */
export function createSubStage(jobId, stageId, payload) {
  // Sort is backend-managed on create for the job-workflow APIs: drop any
  // client-provided sort_order so the shared service assigns the next available
  // value (max + 1). The update APIs still accept sort_order.
  const rest = { ...(payload || {}) };
  delete rest.sort_order;
  return stageService.createSubStage(stageId, rest, jobId);
}

export async function updateSubStage(subStageId, payload, builderId, companyId, user = null) {
  const { isJob } = await resolveBySubStageId(subStageId);
  if (!isJob) {
    throw new Error("Sub-stage is template-scoped. Operation not allowed under job workflow.");
  }
  return stageService.updateSubStage(subStageId, payload, builderId, companyId, user);
}

export async function deleteSubStage(subStageId, builderId, companyId, taskId = null) {
  const { isJob } = await resolveBySubStageId(subStageId);
  if (!isJob) {
    throw new Error("Sub-stage is template-scoped. Operation not allowed under job workflow.");
  }
  return stageService.deleteSubStage(subStageId, builderId, companyId, taskId);
}

/**
 * Eagerly clone every workflow stage's templates into the job tables. Idempotent.
 * Used at job creation and as a manual backfill endpoint.
 */
export function initializeJobWorkflow(jobId, builderId, companyId, transaction = null) {
  return stageService.initializeJobWorkflow(jobId, builderId, companyId, transaction);
}

/**
 * Sync / un-sync a whole stage (and its tasks) within a single job. Reversible.
 */
export function setStageSync(jobId, stageId, isSynced, builderId, companyId, viewer = null) {
  return stageService.setJobStageSync(jobId, stageId, isSynced, builderId, companyId, viewer);
}

/* ===================== TASKS ===================== */

export async function createTask(subStageId, payload, builderId, companyId, user = null) {
  const { isJob } = await resolveBySubStageId(subStageId);
  if (!isJob) {
    throw new Error("Sub-stage is template-scoped. Operation not allowed under job workflow.");
  }
  // Sort is backend-managed on create for the job-workflow APIs: drop any
  // client-provided sort_order so the shared service assigns the next available
  // value (max + 1). The update APIs still accept sort_order.
  const rest = { ...(payload || {}) };
  delete rest.sort_order;
  return taskService.createTaskService(subStageId, rest, builderId, companyId, user);
}

export async function getTasks(subStageId, builderId, companyId, viewer = null) {
  const { isJob } = await resolveBySubStageId(subStageId);
  if (!isJob) {
    throw new Error("Sub-stage is template-scoped. Operation not allowed under job workflow.");
  }
  return taskService.getTasks(subStageId, builderId, companyId, viewer);
}

export async function updateTask(taskId, payload, builderId, companyId, user = null) {
  const { isJob } = await resolveByTaskId(taskId);
  if (!isJob) {
    throw new Error("Task is template-scoped. Operation not allowed under job workflow.");
  }
  return taskService.updateTask(taskId, payload, builderId, companyId, user);
}

export async function deleteTask(taskId, builderId, companyId) {
  const { isJob } = await resolveByTaskId(taskId);
  if (!isJob) {
    throw new Error("Task is template-scoped. Operation not allowed under job workflow.");
  }
  return taskService.deleteTask(taskId, builderId, companyId);
}

/** What the "Email assignee" mail panel opens with. */
export async function getAssigneeMailContext(taskId, builderId, companyId, user = null) {
  const { isJob } = await resolveByTaskId(taskId);
  if (!isJob) {
    throw new Error("Task is template-scoped. Operation not allowed under job workflow.");
  }
  return taskService.getAssigneeMailContext(taskId, builderId, companyId, user);
}

/** Email the task's assignee that the task is theirs. */
export async function notifyTaskAssignee(taskId, builderId, companyId, user = null, payload = {}) {
  const { isJob } = await resolveByTaskId(taskId);
  if (!isJob) {
    throw new Error("Task is template-scoped. Operation not allowed under job workflow.");
  }
  return taskService.notifyTaskAssignee(taskId, builderId, companyId, user, payload);
}

export async function uploadTaskAttachment(taskId, jobId, file, user) {
  const { isJob } = await resolveByTaskId(taskId);
  if (!isJob) {
    throw new Error("Task is template-scoped. Operation not allowed under job workflow.");
  }
  return taskService.uploadTaskAttachment(taskId, jobId, file, user);
}

export async function deleteTaskAttachment(taskId, fileId, companyId) {
  const { isJob } = await resolveByTaskId(taskId);
  if (!isJob) {
    throw new Error("Task is template-scoped. Operation not allowed under job workflow.");
  }
  return taskService.deleteTaskAttachment(taskId, fileId, companyId);
}

/* ===================== SUB-TASKS ===================== */

export async function createSubTask(taskId, payload, builderId, companyId) {
  const { isJob } = await resolveByTaskId(taskId);
  if (!isJob) {
    throw new Error("Task is template-scoped. Operation not allowed under job workflow.");
  }
  return taskService.createSubTask(taskId, payload, builderId, companyId);
}

export async function getSubTasks(taskId, builderId, companyId) {
  const { isJob } = await resolveByTaskId(taskId);
  if (!isJob) {
    throw new Error("Task is template-scoped. Operation not allowed under job workflow.");
  }
  return taskService.getSubTasks(taskId, builderId, companyId);
}

export async function updateSubTask(subTaskId, payload, builderId, companyId) {
  const { isJob } = await resolveBySubtaskId(subTaskId);
  if (!isJob) {
    throw new Error("Sub-task is template-scoped. Operation not allowed under job workflow.");
  }
  return taskService.updateSubTask(subTaskId, payload, builderId, companyId);
}

export async function deleteSubTask(subTaskId, builderId, companyId) {
  const { isJob } = await resolveBySubtaskId(subTaskId);
  if (!isJob) {
    throw new Error("Sub-task is template-scoped. Operation not allowed under job workflow.");
  }
  return taskService.deleteSubTask(subTaskId, builderId, companyId);
}

/* ===================== DEPENDENCIES ===================== */

export async function deleteTaskDependency(taskId, predecessorTaskId, builderId, companyId) {
  const { isJob } = await resolveByTaskId(taskId);
  if (!isJob) {
    throw new Error("Task is template-scoped. Operation not allowed under job workflow.");
  }
  return taskService.deleteTaskDependency(taskId, predecessorTaskId, builderId, companyId);
}

export default {
  getSubStages,
  createSubStage,
  updateSubStage,
  deleteSubStage,
  initializeJobWorkflow,
  setStageSync,
  createTask,
  getTasks,
  updateTask,
  deleteTask,
  getAssigneeMailContext,
  notifyTaskAssignee,
  uploadTaskAttachment,
  deleteTaskAttachment,
  createSubTask,
  getSubTasks,
  updateSubTask,
  deleteSubTask,
  deleteTaskDependency,
};
