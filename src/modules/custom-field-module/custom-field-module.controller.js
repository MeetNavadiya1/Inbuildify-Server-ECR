import customFieldModuleService from "./custom-field-module.service.js";
import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";

/**
 * CREATE CUSTOM FIELD MODULE
 */
export async function createCustomFieldModule(req, res) {
  try {
    const { name } = req.body;
    if (!name) {
      return errorResponse(res, 400, "Custom field module name is required.");
    }

    const result = await customFieldModuleService.createCustomFieldModuleService(req.body);

    return successResponse(
      res,
      result,
      "Custom field module created successfully.",
    );
  } catch (error) {
    console.error("Error creating custom field module:", error);
    return handleControllerError(res, error,
      error.message || "Internal Server Error",
    );
  }
}

/**
 * GET ALL CUSTOM FIELD MODULES
 */
export async function getAllCustomFieldModule(req, res) {
  try {
    const { page, limit } = req.query;

    const result = await customFieldModuleService.getAllCustomFieldModulesService(
      page,
      limit,
    );

    return successResponse(
      res,
      result,
      "Custom field modules fetched successfully.",
    );
  } catch (error) {
    console.error("Error fetching custom field modules:", error);
    return handleControllerError(res, error,
      error.message || "Internal Server Error",
    );
  }
}

/**
 * DELETE CUSTOM FIELD MODULE
 */
export async function deleteCustomFieldModule(req, res) {
  try {
    const { module_id } = req.params;

    const result = await customFieldModuleService.deleteCustomFieldModuleService(
      module_id,
    );

    return successResponse(
      res,
      result,
      "Custom field module deleted successfully.",
    );
  } catch (error) {
    console.error("Error deleting custom field module:", error);
    return handleControllerError(res, error,
      error.message || "Internal Server Error",
    );
  }
}

/**
 * UPDATE CUSTOM FIELD MODULE
 */
export async function updateCustomFieldModule(req, res) {
  try {
    const { module_id } = req.params;
    const { name, description } = req.body;

    if (name === undefined && description === undefined) {
      return errorResponse(
        res,
        400,
        "At least one field must be provided for update.",
      );
    }

    const result = await customFieldModuleService.updateCustomFieldModuleService(
      module_id,
      req.body,
    );

    return successResponse(
      res,
      result,
      "Custom field module updated successfully.",
    );
  } catch (error) {
    console.error("Update custom field module error:", error);
    return handleControllerError(res, error,
      error.message || "Internal Server Error",
    );
  }
}
