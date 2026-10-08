import { successResponse, errorResponse } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  getAllWorkFlowProcessService,
  createWorkFlowProcessService,
  updateWorkFlowProcessService,
  displayOrderManageService,
  deleteWorkFlowProcessService,
  getWorkflowProcessesByCategoryIdService,
  createWorkflowProcessTaskService,
  updateWorkflowProcessTaskService,
  deleteWorkflowProcessTaskService,
} from "./workflow-process.service.js";

export async function getAllWorkFlowProcess(req, res) {
  try {
    const { limit, offset } = req.query;
    const parsedLimit = parseInt(limit, 10) || 25;
    const parsedOffset = parseInt(offset, 10) || 0;
    const builderId = req.user.builder_id;

    const data = await getAllWorkFlowProcessService({
      builderId,
      parsedLimit,
      parsedOffset,
    });

    return successResponse(res, keysToCamelCase(data), "Workflow processes fetched successfully.");
  } catch (error) {
    console.error("Get all workflow process error:", error);
    return errorResponse(res, error?.statusCode || 400, error?.message || "Failed to fetch workflow processes.");
  }
}

export async function createWorkFlowProcess(req, res) {
  try {
    const { name, description } = req.body;
    const builderId = req.user.builder_id;
    const userId = req.user.user_id;

    const workflow = await createWorkFlowProcessService({
      name,
      description,
      builderId,
      userId,
    });

    return successResponse(res, keysToCamelCase(workflow), "Workflow process created successfully.");
  } catch (error) {
    console.error("Create workflow process error:", error);
    return errorResponse(res, error?.statusCode || 500, error?.message || "Failed to create workflow process.");
  }
}

export async function updateWorkFlowProcess(req, res) {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    const builderId = req.user.builder_id;
    const userId = req.user.user_id;

    const workflow = await updateWorkFlowProcessService({
      id,
      name,
      description,
      builderId,
      userId,
    });

    return successResponse(res, keysToCamelCase(workflow), "Workflow process updated successfully.");
  } catch (error) {
    console.error("Update workflow process error:", error);
    return errorResponse(res, error?.statusCode || 500, error?.message || "Failed to update workflow process.");
  }
}

export async function displayOrderManage(req, res) {
  try {
    const { orderedWorkflowProcess } = req.body;
    const builderId = req.user.builder_id;

    await displayOrderManageService({
      orderedWorkflowProcess,
      builderId,
    });

    return successResponse(res, "", "Workflow process display orders updated successfully.");
  } catch (error) {
    console.error("Display order manage error:", error);
    return errorResponse(res, error?.statusCode || 400, error?.message || "Failed to manage workflow process display orders.");
  }
}

export async function deleteWorkFlowProcess(req, res) {
  try {
    const { id } = req.params;
    const builderId = req.user.builder_id;
    const userId = req.user.user_id;

    const workflow = await deleteWorkFlowProcessService({ id, builderId, userId });

    return successResponse(res, keysToCamelCase(workflow), "Workflow process deleted successfully.");
  } catch (error) {
    console.error("Delete workflow process error:", error);
    return errorResponse(res, error?.statusCode || 500, error?.message || "Failed to delete workflow process.");
  }
}

export async function getWorkflowProcessesByCategoryId(req, res) {
  try {
    const { workflow_process_id } = req.params;
    const builderId = req.user.builder_id;

    const tasks = await getWorkflowProcessesByCategoryIdService({
      workflow_process_id,
      builderId,
    });

    return successResponse(res, keysToCamelCase(tasks), "Workflow process tasks fetched successfully.");
  } catch (error) {
    console.error("Error fetching workflow process tasks:", error);
    return errorResponse(res, error?.statusCode || 400, error?.message || "Internal Server Error");
  }
}

export async function createWorkflowProcessTask(req, res) {
  try {
    const builderId = req.user.builder_id;
    const { workflow_process_id, name, description, timespent } = req.body;
    const imageUrl = req.file?.location;

    const task = await createWorkflowProcessTaskService({
      builderId,
      workflow_process_id,
      name,
      description,
      timespent,
      imageUrl,
    });

    return successResponse(res, keysToCamelCase(task), "Workflow process task created successfully.");
  } catch (error) {
    console.error("Error creating workflow process task:", error);
    return errorResponse(res, error?.statusCode || 400, error?.message || "Internal Server Error");
  }
}

export async function updateWorkflowProcessTask(req, res) {
  try {
    const builderId = req.user.builder_id;
    const { workflow_process_task_id } = req.params;
    const imageUrl = req.file?.location;

    // Prevent updating workflow_process_id
    if ("workflow_process_id" in req.body) {
      return errorResponse(res, 400, "Updating workflow_process_id is not allowed.");
    }

    const { name, description, timespent } = req.body;

    const task = await updateWorkflowProcessTaskService({
      builderId,
      workflow_process_task_id,
      name,
      description,
      timespent,
      imageUrl,
    });

    return successResponse(res, keysToCamelCase(task), "Workflow process task updated successfully.");
  } catch (error) {
    console.error("Error updating workflow process task:", error);
    return errorResponse(res, error?.statusCode || 400, error?.message || "Internal Server Error");
  }
}

export async function deleteWorkflowProcessTask(req, res) {
  try {
    const builderId = req.user.builder_id;
    const { workflow_process_task_id } = req.params;

    const task = await deleteWorkflowProcessTaskService({
      builderId,
      workflow_process_task_id,
    });

    return successResponse(res, keysToCamelCase(task), "Workflow process task deleted successfully.");
  } catch (error) {
    console.error("Error deleting workflow process task:", error);
    return errorResponse(res, error?.statusCode || 400, error?.message || "Internal Server Error");
  }
}
