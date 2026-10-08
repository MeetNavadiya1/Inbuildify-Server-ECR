import { successResponse, handleControllerError } from "../../helper/response.js";
import packagePriceListItemMapService from "./package_pricelist_item_map.service.js";

export async function createPackagePriceListItemMap(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const { package_id, price_list_item_id } = req.body;

    const result = await packagePriceListItemMapService.createPackagePriceListItemMap(
      package_id,
      price_list_item_id,
      builderId,
    );

    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("Error creating package_pricelist_item_map:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function getAllPackagePriceListItemMap(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const { page = 1, limit = 25 } = req.query;

    const result = await packagePriceListItemMapService.getAllPackagePriceListItemMap(
      builderId,
      page,
      limit,
    );

    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("Error fetching package price list item map:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function getPackagePricelistItemByPackageId(req, res) {
  try {
    const { package_id } = req.params;
    const builderId = req.user?.builder_id;

    const result = await packagePriceListItemMapService.getPackagePricelistItemByPackageId(
      package_id,
      builderId,
    );

    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("Error fetching package price list item map by package_id:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function deletePackagePricelistItemMapMap(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const { id } = req.params;

    const result = await packagePriceListItemMapService.deletePackagePricelistItemMap(id, builderId);

    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("Error deleting package pricelist item map:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function updatePackagePriceListItemMap(req, res) {
  try {
    const { id } = req.params;
    const builderId = req.user?.builder_id;
    const updateData = req.body;

    const result = await packagePriceListItemMapService.updatePackagePriceListItemMap(
      id,
      updateData,
      builderId,
    );

    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("Error updating package_pricelist_item_map:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}
