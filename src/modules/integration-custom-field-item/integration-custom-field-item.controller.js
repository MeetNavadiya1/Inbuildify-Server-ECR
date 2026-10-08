import { successResponse, errorResponse } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  createItemService,
  getAllItemsService,
  updateItemService,
  deleteItemService,
} from "./integration-custom-field-item.service.js";

/**
 * Creates a new integration custom field item.
 */
export async function createIntegrationCustomFieldItem(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.users_id;

    const result = await createItemService(req.body, {
      builderId,
      companyId,
      userId,
    });

    return successResponse(
      res,
      keysToCamelCase(result),
      "Integration custom field item created successfully.",
    );
  } catch (error) {
    console.error("Error creating integration custom field item:", error);
    const statusCode = error.status || 500;
    const message = error.message || "Internal Server Error.";
    return errorResponse(res, statusCode, message);
  }
}

/**
 * Retrieves all integration custom field items.
 */
export async function getAllIntegrationCustomFieldItem(req, res) {
  try {
    const builderId = req.user?.builder_id;

    const result = await getAllItemsService(req.query, { builderId });

    return successResponse(
      res,
      keysToCamelCase(result),
      "Integration custom field items fetched successfully.",
    );
  } catch (error) {
    console.error("Error fetching integration custom field items:", error);
    const statusCode = error.status || 500;
    const message = error.message || "Internal Server Error.";
    return errorResponse(res, statusCode, message);
  }
}

/**
 * Deletes an integration custom field item.
 */
export async function deleteIntegrationCustomFieldItem(req, res) {
  try {
    const { integration_custom_field_item_id } = req.params;
    const builderId = req.user?.builder_id;

    await deleteItemService(integration_custom_field_item_id, { builderId });

    return successResponse(
      res,
      null,
      "Integration custom field item deleted successfully.",
    );
  } catch (error) {
    console.error("Error deleting integration custom field item:", error);
    const statusCode = error.status || 500;
    const message = error.message || "Internal Server Error.";
    return errorResponse(res, statusCode, message);
  }
}

/**
 * Updates an existing integration custom field item.
 */
export async function updateIntegrationCustomFieldItem(req, res) {
  try {
    const { integration_custom_field_item_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.users_id;

    const result = await updateItemService(integration_custom_field_item_id, req.body, {
      builderId,
      companyId,
      userId,
    });

    return successResponse(
      res,
      keysToCamelCase(result),
      "Integration custom field item updated successfully.",
    );
  } catch (error) {
    console.error("Error updating integration custom field item:", error);
    const statusCode = error.status || 500;
    const message = error.message || "Internal Server Error";
    return errorResponse(res, statusCode, message);
  }
}
