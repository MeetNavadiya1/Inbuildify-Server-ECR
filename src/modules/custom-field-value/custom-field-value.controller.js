import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import customFieldValueService from "./custom-field-value.service.js";

/**
 * CREATE CUSTOM FIELD VALUE
 */
export async function createCustomFieldValue(req, res) {
  try {
    const { builder_id: builderId, company_id: companyId } = req.user;

    const result = await customFieldValueService.createCustomFieldValueService(
      req.body,
      { builderId, companyId },
    );

    return successResponse(
      res,
      result,
      "Custom field value created successfully.",
    );
  } catch (error) {
    console.error("Error creating custom field value:", error);
    return errorResponse(
      res,
      error.status || 400,
      error.message || "Internal Server Error",
    );
  }
}

/**
 * GET ALL CUSTOM FIELD VALUES
 */
export async function getAllCustomFieldValue(req, res) {
  try {
    const { builder_id: builderId } = req.user;

    const result = await customFieldValueService.getAllCustomFieldValuesService(
      req.query,
      { builderId },
    );

    return successResponse(
      res,
      result,
      "Custom field values fetched successfully.",
    );
  } catch (error) {
    console.error("Error fetching custom field values:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

/**
 * UPDATE CUSTOM FIELD VALUE
 */
export async function updateCustomFieldValue(req, res) {
  try {
    const { builder_id: builderId, company_id: companyId } = req.user;
    const { custom_field_value_id } = req.params;

    if (!companyId) {
      return errorResponse(res, 400, "Company ID not found.");
    }

    if (!custom_field_value_id) {
      return errorResponse(res, 400, "custom_field_value_id is required.");
    }

    const result = await customFieldValueService.updateCustomFieldValueService(
      custom_field_value_id,
      req.body,
      { builderId, companyId },
    );

    return successResponse(
      res,
      result,
      "Custom field value updated successfully.",
    );
  } catch (error) {
    console.error("Error updating custom field value:", error);
    return handleControllerError(res, error,
      error.message || "Internal Server Error",
    );
  }
}

/**
 * DELETE CUSTOM FIELD VALUE
 */
export async function deleteCustomFieldValue(req, res) {
  try {
    const { builder_id: builderId } = req.user;
    const { custom_field_value_id } = req.params;

    if (!custom_field_value_id) {
      return errorResponse(res, 400, "custom_field_value_id is required.");
    }

    await customFieldValueService.deleteCustomFieldValueService(
      custom_field_value_id,
      { builderId },
    );

    return successResponse(
      res,
      null,
      "Custom field value deleted successfully.",
    );
  } catch (error) {
    console.error("Error deleting custom field value:", error);
    return handleControllerError(res, error,
      error.message || "Internal Server Error",
    );
  }
}
