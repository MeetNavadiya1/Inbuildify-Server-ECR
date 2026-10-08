import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  createChecklistItemService,
  getChecklistItemsByChecklistIdService,
  deleteChecklistItemService,
  updateChecklistItemService,
} from "./checklist-item.service.js";



export async function getChecklistItemsByChecklistId(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const { checklist_id } = req.params;

    if (!checklist_id) {
      return errorResponse(res, 400, "checklist_id is required.");
    }

    const items = await getChecklistItemsByChecklistIdService({
      builderId,
      checklist_id,
    });

    return successResponse(
      res,
      keysToCamelCase(items),
      "Checklist items fetched successfully.",
    );
  } catch (error) {
    console.error("Error fetching checklist items by checklist ID:", error);
    return handleControllerError(res, error, error.message);
  }
}

export async function deleteChecklistItem(req, res) {
  try {
    const { checklist_item_id } = req.params;
    const builderId = req.user?.builder_id;

    if (!builderId) {
      return errorResponse(res, 400, "Builder ID missing");
    }

    await deleteChecklistItemService({
      builderId,
      checklist_item_id,
    });

    return successResponse(
      res,
      { message: "Checklist item deleted successfully" },
      "Success",
    );
  } catch (err) {
    console.error("Error deleting checklist item:", err);
    return handleControllerError(res, err, err.message);
  }
}

export async function updateChecklistItem(req, res) {
  try {
    const { checklist_item_id } = req.params;
    const builderId = req.user?.builder_id;

    const { checklist_id, description, notes, is_required, type, sort } =
      req.body;

    const result = await updateChecklistItemService({
      builderId,
      checklist_item_id,
      checklist_id,
      description,
      notes,
      is_required,
      type,
      sort,
    });

    return successResponse(
      res,
      keysToCamelCase(result),
      "Checklist item updated successfully.",
    );
  } catch (error) {
    console.error("Error updating checklist item:", error);
    return handleControllerError(res, error, error.message);
  }
}

export async function createChecklistItem(req, res) {
  const builderId = req.user?.builder_id;
  const userId = req.user?.user_id;

  const {
    checklist_id,
    construction_type_id = null,
    construction_stage_id = null,
    description,
    notes = false,
    is_required = false,
    type,
    sort,
  } = req.body;

  try {
    if (!builderId) {
      return errorResponse(res, 403, "Unauthorized. Builder login required.");
    }

    if (!checklist_id || !description || !type || sort === undefined) {
      return errorResponse(res, 400, "checklist_id, description, type, and sort are required.");
    }

    if (!["checkbox", "dropdown"].includes(type)) {
      return errorResponse(res, 400, "Invalid type. Allowed: checkbox, dropdown.");
    }

    const result = await createChecklistItemService({
      builderId,
      userId,
      checklist_id,
      construction_type_id,
      construction_stage_id,
      description: description.trim(),
      notes,
      is_required,
      type,
      sort,
    });

    return successResponse(res, keysToCamelCase(result), "Checklist item created successfully.");
  } catch (error) {
    console.error("Error creating checklist item:", error);
    return handleControllerError(res, error, error.message || "Internal server error.");
  }
}
