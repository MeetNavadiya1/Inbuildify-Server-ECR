import { successResponse, errorResponse } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import { getAllWorkFlowProcessTaskService, deleteWorkFlowProcessTaskService } from "./workflow-process-task.service.js";



export async function getAllWorkFlowProcessTask(req, res) {
  try {
    const { limit, offset, workflow_process_id, lead_id } = req.query;
    const parsedLimit = parseInt(limit, 10) || 25;
    const parsedOffset = parseInt(offset, 10) || 0;
    const builderId = req.user.builder_id;

    const tasks = await getAllWorkFlowProcessTaskService({
      builderId,
      lead_id,
      workflow_process_id,
      parsedLimit,
      parsedOffset,
    });

    return successResponse(res, keysToCamelCase(tasks), "Workflow process tasks fetched successfully.");
  } catch (error) {
    console.error("Get all workflow process task outer error:", error);
    return errorResponse(res, error.statusCode || 400, error.message);
  }
}

export async function deleteWorkFlowProcessTask(req, res) {
  try {
    const { action_id } = req.params;
    const builderId = req.user.builder_id;
    const taskWithUsers = await deleteWorkFlowProcessTaskService({
      builderId,
      action_id,
    });
    return successResponse(res, keysToCamelCase(taskWithUsers), "Workflow process task deleted successfully.");
  } catch (error) {
    console.error("Delete workflow process task outer error:", error);
    return errorResponse(res, error.statusCode || 400, error.message);
  }
}
