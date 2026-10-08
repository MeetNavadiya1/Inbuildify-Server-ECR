import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";

import {
  getAllChecklistService,
  createChecklistService,
  updateChecklistService,
  updateChecklistIsActiveService,
  deleteChecklistService,
} from "./checklist.service.js";

export async function getAllChecklist(req, res) {
  const builderId = req.user.builder_id;
  const { page = 1, limit = 25 } = req.query;

  try {
    const result = await getAllChecklistService({
      builderId,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    });

    return successResponse(res, result, "Checklist fetched successfully.");
  } catch (error) {
    console.error("Error fetching checklist:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function createChecklist(req, res) {
  const createdBy = req.user?.user_id;
  const builderId = req.user?.builder_id;

  const { name, screen_id, functionality_id, is_active } = req.body;

  try {
    if (!name || !screen_id || !functionality_id) {
      return errorResponse(res, 400, "Required fields are missing.");
    }

    const result = await createChecklistService({
      name,
      screen_id,
      functionality_id,
      is_active,
      createdBy,
      builderId,
    });

    return successResponse(
      res,
      result,
      "Checklist created successfully.",
    );
  } catch (error) {
    console.error("Checklist create error:", error);
    return handleControllerError(res, error,
      error.message || "Failed to create checklist",
    );
  }
}

export async function updateChecklist(req, res) {
  const builderId = req.user?.builder_id;
  const userId = req.user?.user_id;
  const { checklist_id } = req.params;

  try {
    const result = await updateChecklistService({
      checklistId: checklist_id,
      builderId,
      userId,
      payload: req.body,
    });

    return successResponse(res, result, "Checklist updated successfully.");
  } catch (err) {
    console.error("Error updating checklist:", err);
    return handleControllerError(res, err, err.message || "Failed to update checklist.");
  }
}

export async function updateChecklistIsActive(req, res) {
  const builderId = req.user?.builder_id;
  const userId = req.user?.user_id;
  const { checklist_id } = req.params;

  try {
    if (!checklist_id) {
      return errorResponse(res, 400, "checklist_id is required");
    }

    const result = await updateChecklistIsActiveService({ checklistId: checklist_id, builderId, userId });

    return successResponse(res, result, "Checklist status updated successfully.");
  } catch (error) {
    console.error("Error updating checklist is_active:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function deleteChecklist(req, res) {
  const { checklist_id } = req.params;
  const builderId = req.user?.builder_id;
  const userId = req.user?.user_id;

  try {
    if (!builderId) {
      return errorResponse(res, 403, "Unauthorized. Builder login required.");
    }

    if (!checklist_id) {
      return errorResponse(res, 400, "Checklist ID is required.");
    }

    await deleteChecklistService({ checklist_id, builderId, userId });

    return successResponse(res, {}, "Checklist deleted successfully.");
  } catch (error) {
    console.error("Error soft deleting checklist:", error);
    return handleControllerError(res, error, error.message || "Failed to delete checklist.");
  }
}
