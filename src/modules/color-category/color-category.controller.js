import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  createColorCategoryService,
  getColorCategoriesService,
  getColorCategoryByIdService,
  updateColorCategoryService,
  getColorCategoriesByColorIdService,
  deleteColorCategoryService,
  copyColorCategoryService,
} from "./color-category.service.js";

export async function createColorCategory(req, res) {
  try {
    const result = await createColorCategoryService(req.user, req.body);
    return successResponse(
      res,
      keysToCamelCase(result),
      "Color category created successfully.",
    );
  } catch (err) {
    console.error("Error creating color category:", err);
    return errorResponse(res, err.status || 400, err.message || "Internal Server Error");
  }
}

export async function getColorCategories(req, res) {
  try {
    const data = await getColorCategoriesService(req.user, req.query);
    return successResponse(
      res,
      {
        colorCategories: keysToCamelCase(data.colorCategories),
        pagination: data.pagination,
      },
      "Color categories fetched successfully.",
    );
  } catch (err) {
    console.error("Error fetching color categories:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function getColorCategoryById(req, res) {
  try {
    const { id } = req.params;
    const result = await getColorCategoryByIdService(req.user, id);
    return successResponse(
      res,
      keysToCamelCase(result),
      "Color category fetched successfully.",
    );
  } catch (err) {
    console.error("Error fetching color category:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function updateColorCategory(req, res) {
  try {
    const { id } = req.params;
    const result = await updateColorCategoryService(req.user, id, req.body);
    return successResponse(
      res,
      keysToCamelCase(result),
      "Color category updated successfully.",
    );
  } catch (err) {
    console.error("Error updating color category:", err);
    return errorResponse(res, err.status || 400, err.message || "Internal Server Error");
  }
}

export async function getColorCategoriesByColorId(req, res) {
  try {
    const { id } = req.params;
    const result = await getColorCategoriesByColorIdService(req.user, id);
    return successResponse(
      res,
      keysToCamelCase(result),
      "Color categories fetched successfully.",
    );
  } catch (err) {
    console.error("Error fetching color categories by color ID:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function deleteColorCategory(req, res) {
  try {
    const { id } = req.params;
    await deleteColorCategoryService(req.user, id);
    return successResponse(res, null, "Color category deleted successfully.");
  } catch (err) {
    console.error("Error deleting color category:", err);
    return errorResponse(res, err.status || 400, err.message || "Internal Server Error");
  }
}

export async function copyColorCategory(req, res) {
  try {
    const { id } = req.params;
    const result = await copyColorCategoryService(req.user, id, req.body);
    return successResponse(
      res,
      keysToCamelCase(result),
      "Color category copied successfully with all items.",
    );
  } catch (err) {
    console.error("Error copying color category:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}
