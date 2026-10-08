import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  createColorItemCustomFieldService,
  getColorItemCustomFieldsService,
  getColorItemCustomFieldByIdService,
  updateColorItemCustomFieldService,
  deleteColorItemCustomFieldService,
} from "./color-item-custom-field.service.js";

export async function createColorItemCustomField(req, res) {
  try {
    const newField = await createColorItemCustomFieldService(req.user, req.body);

    return successResponse(
      res,
      keysToCamelCase(newField),
      "Color item custom field created successfully.",
    );
  } catch (err) {
    console.error("Error creating color item custom field:", err);
    return errorResponse(res, err.status || 400, err.message || "Internal Server Error");
  }
}

export async function getColorItemCustomFields(req, res) {
  try {
    const data = await getColorItemCustomFieldsService(req.user, req.query);

    return successResponse(
      res,
      {
        colorItemCustomFields: keysToCamelCase(data.colorItemCustomFields),
        pagination: data.pagination,
      },
      "Color item custom fields fetched successfully.",
    );
  } catch (err) {
    console.error("Error fetching color item custom fields:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function getColorItemCustomFieldById(req, res) {
  try {
    const { id } = req.params;
    const field = await getColorItemCustomFieldByIdService(req.user, id);

    return successResponse(
      res,
      keysToCamelCase(field),
      "Color item custom field fetched successfully.",
    );
  } catch (err) {
    console.error("Error fetching color item custom field:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function updateColorItemCustomField(req, res) {
  try {
    const { id } = req.params;
    const updatedField = await updateColorItemCustomFieldService(req.user, id, req.body);

    return successResponse(
      res,
      keysToCamelCase(updatedField),
      "Color item custom field updated successfully.",
    );
  } catch (err) {
    console.error("Error updating color item custom field:", err);
    return errorResponse(res, err.status || 400, err.message || "Internal Server Error");
  }
}

export async function deleteColorItemCustomField(req, res) {
  try {
    const { id } = req.params;
    await deleteColorItemCustomFieldService(req.user, id);

    return successResponse(
      res,
      null,
      "Color item custom field deleted successfully.",
    );
  } catch (err) {
    console.error("Error deleting color item custom field:", err);
    return errorResponse(res, err.status || 400, err.message || "Internal Server Error");
  }
}
