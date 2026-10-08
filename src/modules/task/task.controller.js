import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import { checkLeadLockStatus, resolveJobIdForLead } from "../../helper/leadLock.helper.js";
import {
  createTaskService,
  getAllTasksService,
  deleteTaskService,
  updateTaskService,
} from "./task.service.js";

const JOB_SCOPED_LINK_TYPES = ["Job", "Construction", "Maintenance"];

/**
 * Controller: Create Task
 */
export async function createTask(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.users_id;

    if (!builderId || !companyId) {
      return errorResponse(res, 400, "Invalid builder or company");
    }

    const {
      name,
      description,
      due_date,
      due_time,
      assignee_id,
      link_to,
      link_type,
      lead_id,
      job_id,
      priority,
      status,
    } = req.body;

    const attach_files = req.files?.attachFiles?.[0]?.location || null;

    let effectiveJobId = job_id || req.body.jobId || null;
    let effectiveLinkType = link_type || req.body.linkType || null;

    if (lead_id) {
      // A lost lead is closed for good — nothing can be added to it.
      await checkLeadLockStatus(lead_id, null, { blockOutcomes: ["lost"] });

      // Once a lead is won it lives on as a job, so a task raised against it
      // belongs on the job timeline. Screens that already know the job (job
      // detail) send job_id/link_type themselves; the ones that only hold the
      // lead (global "Create Task", lead search) get it resolved here instead
      // of failing the won-lead lock.
      if (!effectiveJobId) {
        effectiveJobId = await resolveJobIdForLead(lead_id);
      }

      if (effectiveJobId) {
        // A job task is never a sales task, whatever the caller sent.
        if (!effectiveLinkType || effectiveLinkType === "Sales") {
          effectiveLinkType = "Job";
        }
      } else if (!JOB_SCOPED_LINK_TYPES.includes(effectiveLinkType)) {
        // Still a sales lead (or won with no job row yet) — the sales lock
        // stands: no new lead tasks once the opportunity is closed.
        await checkLeadLockStatus(lead_id);
      }
    }

    const result = await createTaskService({
      builderId,
      companyId,
      createdBy: userId,
      name,
      description,
      due_date,
      due_time,
      assignee_id,
      link_to,
      link_type,
      lead_id,
      job_id,
      priority,
      status,
      attach_files,
    });

    if (result.error) {
      return errorResponse(res, result.error.status, result.error.message);
    }

    return successResponse(res, result.data, "Task created successfully.");
  } catch (err) {
    console.error("Error creating task:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

/**
 * Controller: Get All Tasks
 */
export async function getAllTasks(req, res) {
  try {
    const builderId = req.user?.builder_id;

    if (!builderId) {
      return errorResponse(res, 400, "Builder ID missing from token");
    }

    const {
      page = 1,
      limit = 25,
      name,
      due_date,
      due_date_from,
      due_date_to,
      status,
      priority,
      assignee_id,
      link_to,
      link_type,
      lead_id,
      job_id,
      date_filter,
      is_deleted,
      sort_by = "created_at",
      sort_order = "DESC",
    } = req.query;

    const result = await getAllTasksService({
      builderId,
      page,
      limit,
      name,
      due_date,
      due_date_from,
      due_date_to,
      status,
      priority,
      assignee_id,
      link_to,
      link_type,
      lead_id,
      job_id,
      date_filter,
      is_deleted,
      sort_by,
      sort_order,
    });

    if (result.error) {
      return errorResponse(res, result.error.status, result.error.message);
    }

    return successResponse(res, result.data, "Tasks fetched successfully");
  } catch (error) {
    console.error("Error in getAllTasks:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

/**
 * Controller: Delete Task
 */
export async function deleteTask(req, res) {
  try {
    const { task_id } = req.params;
    const builderId = req.user?.builder_id;
    const userId = req.user?.users_id;

    if (!task_id) {
      return errorResponse(res, 400, "task_id is required");
    }

    if (!builderId) {
      return errorResponse(res, 400, "Builder ID missing from token");
    }

    const result = await deleteTaskService({ task_id, builderId, userId });

    if (result.error) {
      return errorResponse(res, result.error.status, result.error.message);
    }

    return successResponse(res, result.data, "Task deleted successfully");
  } catch (error) {
    console.error("Error deleting task:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

/**
 * Controller: Update Task
 */
export async function updateTask(req, res) {
  try {
    const { task_id } = req.params;
    const builderId = req.user?.builder_id;
    const userId = req.user?.users_id;

    if (!task_id) {
      return errorResponse(res, 400, "task_id is required");
    }

    const {
      name,
      description,
      due_date,
      due_time,
      assignee_id,
      link_to,
      link_type,
      priority,
      status,
      attach_files,
    } = req.body;

    const uploadedFile = req.files?.attachFiles?.[0]?.location;
    const newAttachFiles = uploadedFile || (attach_files || undefined);
    const clearAttachment = !uploadedFile && (attach_files === "" || attach_files === null);

    const result = await updateTaskService({
      task_id,
      builderId,
      userId,
      name,
      description,
      due_date,
      due_time,
      assignee_id,
      link_to,
      link_type,
      priority,
      status,
      newAttachFiles: clearAttachment ? undefined : newAttachFiles,
      clearAttachment,
    });

    if (result.error) {
      return errorResponse(res, result.error.status, result.error.message);
    }

    return successResponse(res, result.data, "Task updated successfully");
  } catch (error) {
    console.error("Error updating task:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export default {
  createTask,
  getAllTasks,
  deleteTask,
  updateTask,
};
