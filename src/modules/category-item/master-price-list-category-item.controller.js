import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import masterPriceListCategoryItemService from "./master-price-list-category-item.service.js";

export async function createMasterPriceListCategoryItem(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.user_id;

    if (!builderId && !companyId) {
      return errorResponse(res, 401, "Unauthorized: Organization ID missing");
    }

    const item = await masterPriceListCategoryItemService.createItem(builderId, companyId, userId, req.body);

    return successResponse(
      res,
      item,
      "Master price list category item created successfully",
    );
  } catch (error) {
    console.error("Create master price list category item error:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function getMasterPriceListCategoryItemsByCategoryId(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const { categoryId } = req.params;

    if (!builderId && !companyId) {
      return errorResponse(res, 401, "Unauthorized: Organization ID missing");
    }

    const items = await masterPriceListCategoryItemService.getItems(builderId, companyId, categoryId);

    return successResponse(
      res,
      items,
      "Master price list category items fetched successfully",
    );
  } catch (error) {
    console.error("Get master price list category items error:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function updateMasterPriceListCategoryItem(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.user_id;
    const { category_item_id } = req.params;

    if (!builderId && !companyId) {
      return errorResponse(res, 401, "Unauthorized: Organization ID missing");
    }

    const item = await masterPriceListCategoryItemService.updateItem(
      builderId,
      companyId,
      userId,
      category_item_id,
      req.body
    );

    return successResponse(
      res,
      item,
      "Master price list category item updated successfully",
    );
  } catch (error) {
    console.error("Update master price list category item error:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function deleteMasterPriceListCategoryItem(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const { category_item_id } = req.params;

    if (!builderId && !companyId) {
      return errorResponse(res, 401, "Unauthorized: Organization ID missing");
    }

    await masterPriceListCategoryItemService.deleteItem(builderId, companyId, category_item_id);

    return successResponse(
      res,
      null,
      "Master price list category item deleted successfully",
    );
  } catch (error) {
    console.error("Delete master price list category item error:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export default {
  createMasterPriceListCategoryItem,
  getMasterPriceListCategoryItemsByCategoryId,
  updateMasterPriceListCategoryItem,
  deleteMasterPriceListCategoryItem,
};
