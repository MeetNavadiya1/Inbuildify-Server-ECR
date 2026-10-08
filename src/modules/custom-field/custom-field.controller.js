
import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  getAllCustomFieldsService,
  createCustomFieldService,
  updateCustomFieldService,
  deleteCustomFieldService,
  updateCustomFieldIsActiveService,
  createOptionService,
  deleteOptionService,
} from "./custom-field.service.js";

export async function getAllCustomFields(req, res) {
  const builderId = req.user?.builder_id;
  const companyId = req.user?.company_id;

  try {
    if (!builderId) {
      return errorResponse(res, 400, "Builder ID is missing from user context.");
    }

    const { page = 1, limit = 25, module_id } = req.query;

    const result = await getAllCustomFieldsService({
      builderId,
      companyId,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      moduleId: module_id,
    });

    return successResponse(res, result, "Custom fields fetched successfully.");
  } catch (error) {
    console.error("Error fetching custom fields:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function createCustomField(req, res) {
  const builderId = req.user?.builder_id;
  const companyId = req.user?.company_id;
  const userId = req.user?.user_id;

  try {
    if (!companyId) {
      return errorResponse(res, 400, "Company ID not found.");
    }

    const result = await createCustomFieldService({
      builderId,
      companyId,
      userId,
      payload: req.body,
    });

    return successResponse(res, result, "Custom field created successfully.");
  } catch (error) {
    console.error("Error creating custom field:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function updateCustomField(req, res) {
  const builderId = req.user?.builder_id;
  const companyId = req.user?.company_id;
  const userId = req.user?.user_id;
  const { id } = req.params;

  try {
    if (!companyId) {
      return errorResponse(res, 400, "Company ID not found.");
    }

    const result = await updateCustomFieldService({
      id,
      builderId,
      companyId,
      userId,
      payload: req.body,
    });

    return successResponse(res, result, "Custom field updated successfully.");
  } catch (error) {
    console.error("Error updating custom field:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function deleteCustomField(req, res) {
  const builderId = req.user?.builder_id;
  const companyId = req.user?.company_id;
  const { id } = req.params;

  try {
    if (!builderId || !companyId) {
      return errorResponse(res, 400, "Builder ID or Company ID missing from user context.");
    }

    if (!id) {
      return errorResponse(res, 400, "Custom Field ID is required.");
    }

    await deleteCustomFieldService({ id, builderId, companyId });

    return successResponse(res, null, "Custom field deleted successfully.");
  } catch (error) {
    console.error("Error deleting custom field:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function updateCustomFieldIsActive(req, res) {
  const builderId = req.user?.builder_id;
  const userId = req.user?.user_id;
  const { id } = req.params;
  const { is_active } = req.body;

  try {
    if (!id) {
      return errorResponse(res, 400, "custom field id is required");
    }

    if (typeof is_active !== "boolean") {
      return errorResponse(res, 400, "is_active must be boolean (true or false)");
    }

    const result = await updateCustomFieldIsActiveService({ id, builderId, userId, is_active });

    return successResponse(res, result, "custom field status updated successfully.");
  } catch (error) {
    console.error("Error updating custom field is_active:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function createOption(req, res) {
  const builderId = req.user?.builder_id;
  const companyId = req.user?.company_id;
  const userId = req.user?.user_id;
  const { custom_field_id, options } = req.body;

  try {
    if (!custom_field_id || !Array.isArray(options) || options.length === 0) {
      return errorResponse(res, 400, "custom_field_id and options array are required.");
    }

    const result = await createOptionService({ custom_field_id, options, builderId, companyId, userId });

    return successResponse(res, result, "Options added successfully.");
  } catch (error) {
    console.error("Create Option Error:", error);
    return handleControllerError(res, error, error.message || "Internal server error.");
  }
}

export async function deleteOption(req, res) {
  const builderId = req.user?.builder_id;
  const companyId = req.user?.company_id;
  const userId = req.user?.user_id;
  const { custom_field_id } = req.params;
  const { options } = req.body;

  try {
    if (!custom_field_id || !Array.isArray(options) || options.length === 0) {
      return errorResponse(
        res,
        400,
        "custom_field_id (params) and options (array in body) are required.",
      );
    }

    const result = await deleteOptionService({
      custom_field_id,
      options,
      builderId,
      companyId,
      userId,
    });

    return successResponse(res, result, "Option(s) deleted successfully.");
  } catch (error) {
    console.error("Delete Option Error:", error);
    return handleControllerError(res, error, error.message || "Internal server error.");
  }
}
