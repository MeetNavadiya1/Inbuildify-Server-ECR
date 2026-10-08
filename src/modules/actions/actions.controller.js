import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import actionsService from "./actions.service.js";

// Allowed fields per action_type
const ALLOWED_FIELDS = {
  note: [
    "description",
    "notes_tag_id",
    "send_to_customer",
    "create_follow_up_task",
    "attach_file",
  ],
  sms: ["users_id", "description"],
  appointment: [
    "name",
    "due_date",
    "end_date",
    "location_id",
    "start_time",
    "end_time",
    "users_id",
    "description",
    "send_to_customer",
  ],
  task: [
    "name",
    "due_date",
    "end_time",
    "users_id",
    "priority",
    "status",
    "link_to_user",
    "description",
    "attach_file",
  ],
};

// Validate that the body only contains allowed fields for the given action_type
function getInvalidFields(body, actionType) {
  const allowed = new Set([
    ...(ALLOWED_FIELDS[actionType] || []),
    "action_type",
  ]);
  return Object.keys(body).filter((key) => !allowed.has(key));
}

// Filter body to only include allowed fields for the given action_type
function filterBodyByType(body, actionType) {
  const allowed = ALLOWED_FIELDS[actionType] || [];
  const filtered = {};
  for (const key of allowed) {
    if (body[key] !== undefined) {
      filtered[key] = body[key];
    }
  }
  return filtered;
}

export async function createAction(req, res) {
  try {
    const { leads_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const { action_type } = req.body;

    if (!builderId) {
      return errorResponse(res, 401, "Unauthorized: Builder ID missing");
    }

    // Strict field validation
    const invalidFields = getInvalidFields(req.body, action_type);
    if (invalidFields.length > 0) {
      return errorResponse(res, 400, `Fields are not allowed for action type ${action_type}: ${invalidFields.join(", ")}`);
    }

    if (action_type === "sms" && (!req.body.users_id || req.body.users_id.length === 0)) {
      return errorResponse(res, 400, "users_id is required for SMS action type");
    }

    // Filter body to only allowed fields for this action_type
    const filteredBody = filterBodyByType(req.body, action_type);

    // Handle file upload
    const attachFile = req.files?.attachFile?.[0]?.location || null;
    if (
      attachFile &&
      ALLOWED_FIELDS[action_type]?.includes("attach_file")
    ) {
      filteredBody.attach_file = attachFile;
    }

    const action = await actionsService.createAction(leads_id, filteredBody, builderId, companyId);

    return successResponse(
      res,
      action,
      "Action created successfully",
    );
  } catch (error) {
    console.error("Create action error:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function getActions(req, res) {
  try {
    const { leads_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId) {
      return errorResponse(res, 401, "Unauthorized: Builder ID missing");
    }

    const result = await actionsService.getActions(leads_id, req.query, builderId, companyId);

    return successResponse(
      res,
      result,
      "Actions fetched successfully",
    );
  } catch (error) {
    console.error("Get actions error:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function updateAction(req, res) {
  try {
    const { action_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId) {
      return errorResponse(res, 401, "Unauthorized: Builder ID missing");
    }

    // We need to know the action type to validate fields, but we don't want to fetch it here if possible.
    // However, the original code fetched it to validate. 
    // To maintain parity, we let the service fetch it and validate, OR we fetch it here.
    // The original code did: findResult = await client.query(findQuery, [action_id...]); const actionType = existingAction.action_type;
    // Let's fetch the action type from the service or via a light query.
    
    // For exact parity in field validation before calling update:
    // We'll add a getActionType helper to the service or just fetch it here using Actions model.
    // Actually, the service's updateAction handles the fetch and ownership check.
    // But field validation happens before filtering.
    
    // To stay clean, let's keep the validation logic in the controller.
    // We need the action_type to validate the body.
    
    // We can't know the action_type without fetching the action.
    const actionInfo = await actionsService.verifyActionOwnership(action_id, builderId, companyId);
    if (!actionInfo) {
       return errorResponse(res, 404, "Action not found or you do not have permission to update it");
    }
    
    const actionType = actionInfo.action_type;

    // Strict field validation for update
    const invalidFields = getInvalidFields(req.body, actionType);
    if (invalidFields.length > 0) {
      return errorResponse(res, 400, `Fields are not allowed for updating action type ${actionType}: ${invalidFields.join(", ")}`);
    }

    // Filter body to only allowed fields for this action_type
    const filteredBody = filterBodyByType(req.body, actionType);

    // Handle file upload
    const newAttachFile = req.files?.attachFile?.[0]?.location || null;
    if (ALLOWED_FIELDS[actionType]?.includes("attach_file")) {
      if (newAttachFile) {
        filteredBody.attach_file = newAttachFile;
      } else if (
        req.body.attach_file === "" ||
        req.body.attach_file === null
      ) {
        filteredBody.attach_file = null;
      }
    }

    if (Object.keys(filteredBody).length === 0) {
      return errorResponse(res, 400, "No valid fields to update");
    }

    const result = await actionsService.updateAction(action_id, filteredBody, builderId, companyId);

    return successResponse(
      res,
      result,
      "Action updated successfully",
    );
  } catch (error) {
    console.error("Update action error:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function deleteAction(req, res) {
  try {
    const { action_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId) {
      return errorResponse(res, 401, "Unauthorized: Builder ID missing");
    }

    await actionsService.deleteAction(action_id, builderId, companyId);

    return successResponse(res, null, "Action deleted successfully");
  } catch (error) {
    console.error("Delete action error:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export default {
  createAction,
  getActions,
  updateAction,
  deleteAction,
};
