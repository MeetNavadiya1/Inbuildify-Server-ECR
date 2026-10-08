import colorSubCategoryService from "./color-sub-category.service.js";
import { successResponse, errorResponse } from "../../helper/response.js";

export async function getAllColorSubCategories(req, res) {
  try {
    const { color_category_id: colorCategoryId } = req.params;
    const { limit, offset } = req.query;
    const parsedLimit = parseInt(limit, 10) || 25;
    const parsedOffset = parseInt(offset, 10) || 0;

    const { colorSubCategories, totalItems } = await colorSubCategoryService.getAllColorSubCategoriesService(
      req.user,
      colorCategoryId,
      parsedLimit,
      parsedOffset
    );

    const totalPages = Math.ceil(totalItems / parsedLimit);
    const currentPage = Math.floor(parsedOffset / parsedLimit) + 1;

    return successResponse(
      res,
      {
        colorSubCategories,
        pagination: { totalItems, totalPages, currentPage, limit: parsedLimit },
      },
      "Color sub-categories fetched successfully.",
    );
  } catch (error) {
    console.error("Get all color sub-categories error:", error);
    return errorResponse(
      res,
      error.status || 400,
      error.message || "Failed to fetch color sub-categories.",
    );
  }
}

export async function getColorSubCategoryById(req, res) {
  try {
    const { color_sub_category_id } = req.params;
    const response = await colorSubCategoryService.getColorSubCategoryByIdService(req.user, color_sub_category_id);

    return successResponse(
      res,
      response,
      "Color sub-category fetched successfully.",
    );
  } catch (error) {
    console.error("Get color sub-category by ID error:", error);
    return errorResponse(
      res,
      error.status || 500,
      error.message || "Failed to fetch color sub-category."
    );
  }
}

export async function createColorSubCategory(req, res) {
  try {
    const response = await colorSubCategoryService.createColorSubCategoryService(req.user, req.body);

    return successResponse(
      res,
      response,
      "Color sub-category created successfully.",
    );
  } catch (error) {
    console.error("Create color sub-category error:", error);
    return errorResponse(
      res,
      error.status || 500,
      error.message || "Failed to create color sub-category."
    );
  }
}

export async function updateColorSubCategory(req, res) {
  try {
    const { color_sub_category_id } = req.params;
    const response = await colorSubCategoryService.updateColorSubCategoryService(
      req.user,
      color_sub_category_id,
      req.body
    );

    return successResponse(
      res,
      response,
      "Color sub-category updated successfully.",
    );
  } catch (error) {
    console.error("Update color sub-category error:", error);
    return errorResponse(
      res,
      error.status || 500,
      error.message || "Failed to update color sub-category."
    );
  }
}

export async function deleteColorSubCategory(req, res) {
  try {
    const { color_sub_category_id } = req.params;
    const response = await colorSubCategoryService.deleteColorSubCategoryService(req.user, color_sub_category_id);

    return successResponse(
      res,
      response,
      "Color sub-category deleted successfully.",
    );
  } catch (error) {
    console.error("Delete color sub-category error:", error);
    return errorResponse(
      res,
      error.status || 500,
      error.message || "Failed to delete color sub-category."
    );
  }
}

export default {
  getAllColorSubCategories,
  getColorSubCategoryById,
  createColorSubCategory,
  updateColorSubCategory,
  deleteColorSubCategory,
};
