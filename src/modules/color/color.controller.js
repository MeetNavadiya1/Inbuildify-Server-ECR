import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  createColorService,
  getColorsService,
  updateColorService,
  deleteColorService,
  getColorByIdService,
  copyColorService,
} from "./color.service.js";

export async function createColor(req, res) {
  try {
    const newColor = await createColorService(req.user, req.body);

    return successResponse(
      res,
      keysToCamelCase(newColor),
      "Color created successfully.",
    );
  } catch (err) {
    console.error("Error creating color:", err);
    return errorResponse(res, err.status || 400, err.message || "Internal Server Error");
  }
}

export async function getColors(req, res) {
  try {
    const data = await getColorsService(req.user, req.query);

    return successResponse(
      res,
      {
        colors: keysToCamelCase(data.colors),
        pagination: data.pagination,
      },
      "Colors fetched successfully.",
    );
  } catch (err) {
    console.error("Error fetching colors:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function getColorById(req, res) {
  try {
    const { id } = req.params;
    const color = await getColorByIdService(req.user, id);

    return successResponse(
      res,
      keysToCamelCase(color),
      "Color fetched successfully.",
    );
  } catch (err) {
    console.error("Error fetching color:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function updateColor(req, res) {
  try {
    const { id } = req.params;
    const updatedColor = await updateColorService(req.user, id, req.body);

    return successResponse(
      res,
      keysToCamelCase(updatedColor),
      "Color updated successfully.",
    );
  } catch (err) {
    console.error("Error updating color:", err);
    return errorResponse(res, err.status || 400, err.message || "Internal Server Error");
  }
}

export async function deleteColor(req, res) {
  try {
    const { id } = req.params;
    const deletedColor = await deleteColorService(req.user, id);

    return successResponse(
      res,
      keysToCamelCase(deletedColor),
      "Color deleted successfully.",
    );
  } catch (err) {
    console.error("Error deleting color:", err);
    return errorResponse(res, err.status || 400, err.message || "Internal Server Error");
  }
}

export async function copyColor(req, res) {
  try {
    const { color_id } = req.params;
    const newColor = await copyColorService(req.user, color_id, req.body);

    return successResponse(
      res,
      keysToCamelCase(newColor),
      "Color copied successfully with all categories and items.",
    );
  } catch (err) {
    console.error("Error copying color:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}
