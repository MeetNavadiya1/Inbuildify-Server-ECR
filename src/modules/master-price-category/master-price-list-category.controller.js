import masterPriceListCategoryService from "./master-price-list-category.service.js";
import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";

export async function getAllMasterPriceListCategories(req, res) {
  try {
    const { rows, pagination } = await masterPriceListCategoryService.getAllMasterPriceListCategories(req.user, req.query);

    return successResponse(
      res,
      {
        masterPriceListCategory: keysToCamelCase(rows),
        pagination,
      },
      "Master price list category fetched successfully.",
    );
  } catch (error) {
    console.error("Error fetching master price list category:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function getMasterPriceListCategoryById(req, res) {
  try {
    const { id } = req.params;
    const builderId = req.user.builder_id;
    const category = await masterPriceListCategoryService.getMasterPriceListCategoryById(id, builderId);

    return successResponse(
      res,
      keysToCamelCase(category),
      "Category fetched successfully.",
    );
  } catch (error) {
    console.error("Get category by ID error:", error);
    return handleControllerError(res, error, error.message || "Failed to fetch category.");
  }
}

export async function createMasterPriceListCategory(req, res) {
  try {
    const category = await masterPriceListCategoryService.createMasterPriceListCategory(req.user, req.body);

    return successResponse(
      res,
      keysToCamelCase(category),
      "Category created successfully.",
    );
  } catch (error) {
    console.error("Create category error:", error);
    return handleControllerError(res, error, error.message || "Failed to create category.");
  }
}

export async function updateMasterPriceListCategory(req, res) {
  try {
    const { id } = req.params;
    const category = await masterPriceListCategoryService.updateMasterPriceListCategory(id, req.user, req.body);

    return successResponse(
      res,
      keysToCamelCase(category),
      "Category updated successfully.",
    );
  } catch (error) {
    console.error("Update category error:", error);
    return handleControllerError(res, error, error.message || "Failed to update category.");
  }
}

export async function displayOrderManage(req, res) {
  try {
    const updatedRows = await masterPriceListCategoryService.displayOrderManage(req.user, req.body);

    return successResponse(
      res,
      keysToCamelCase(updatedRows),
      "Category display orders updated successfully.",
    );
  } catch (error) {
    console.error("Error updating display order:", error);
    return handleControllerError(res, error, error.message || "Failed to update category display orders.");
  }
}

export async function deleteMasterPriceListCategory(req, res) {
  try {
    const { id } = req.params;
    const builderId = req.user.builder_id;
    const result = await masterPriceListCategoryService.deleteMasterPriceListCategory(id, builderId);

    return successResponse(
      res,
      keysToCamelCase(result),
      "Category deleted successfully.",
    );
  } catch (error) {
    console.error("Delete category error:", error);
    return handleControllerError(res, error, error.message || "Failed to delete category.");
  }
}

export default {
  getAllMasterPriceListCategories,
  getMasterPriceListCategoryById,
  createMasterPriceListCategory,
  updateMasterPriceListCategory,
  displayOrderManage,
  deleteMasterPriceListCategory,
};
