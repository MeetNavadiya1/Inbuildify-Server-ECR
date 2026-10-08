import { errorResponse, successResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  getAllFloorPlanPricelistItemMapsService,
  createFloorPlanPricelistItemMapService,
  deleteFloorPlanPricelistItemMapService,
  getFloorPlanPricelistItemMapByIdService,
  updateFloorPlanPricelistItemMapService,
} from "./floor-plan-pricelist-item-map.service.js";

export async function createFloorPlanPricelistItemMap(req, res) {
  try {
    const {
      floor_plan_id,
      price_list_item_id,
      include_default,
      modify,
      quantity,
    } = req.body;

    const { builder_id: builderId, company_id: companyId } = req.user;

    if (!floor_plan_id) {
      return errorResponse(res, 400, "floor_plan_id is required");
    }

    if (!price_list_item_id) {
      return errorResponse(res, 400, "price_list_item_id is required");
    }

    const mapping = await createFloorPlanPricelistItemMapService({
      floor_plan_id,
      price_list_item_id,
      include_default,
      modify,
      quantity,
      builderId,
      companyId,
    });

    return successResponse(
      res,
      keysToCamelCase(mapping),
      "Floor plan price list item map created successfully.",
    );
  } catch (error) {
    console.error("Create Floor Plan Price List Item Map Error:", error);
    return handleControllerError(res, error,
      error.message || "Internal server error."
    );
  }
}

export async function getAllFloorPlanPricelistItemMaps(req, res) {
  try {
    const {
      page = 1,
      limit = 25,
      floor_plan_id,
      price_list_item_id,
      include_default,
      modify,
    } = req.query;

    const { builder_id, company_id } = req.user;

    const { mappings, pagination } = await getAllFloorPlanPricelistItemMapsService({
      builder_id,
      company_id,
      page,
      limit,
      floor_plan_id,
      price_list_item_id,
      include_default,
      modify,
    });

    return successResponse(
      res,
      {
        mappings: keysToCamelCase(mappings),
        pagination,
      },
      "Floor plan price list item maps fetched successfully.",
    );
  } catch (error) {
    console.error("Get All Floor Plan Price List Item Maps Error:", error);
    return handleControllerError(res, error, error.message || "Internal server error.");
  }
}
/**
 * GET MAPPING BY ID
 */
export async function getFloorPlanPricelistItemMapById(req, res) {
  try {
    const { id } = req.params;
    const { builder_id: builderId, company_id: companyId } = req.user;

    if (!id) {
      return errorResponse(res, 400, "id is required.");
    }

    const result = await getFloorPlanPricelistItemMapByIdService({
      id,
      builderId,
      companyId,
    });

    return successResponse(
      res,
      keysToCamelCase(result),
      "Floor plan price list item map fetched successfully.",
    );
  } catch (error) {
    console.error("Get Floor Plan Price List Item Map By ID Error:", error);
    return handleControllerError(res, error,
      error.message || "Internal server error.",
    );
  }
}

/**
 * UPDATE MAPPING
 */
export async function updateFloorPlanPricelistItemMap(req, res) {
  try {
    const { id } = req.params;
    const { builder_id: builderId, company_id: companyId } = req.user;

    if (!id) {
      return errorResponse(res, 400, "id is required.");
    }

    const result = await updateFloorPlanPricelistItemMapService({
      id,
      builderId,
      companyId,
      payload: req.body,
    });

    return successResponse(
      res,
      keysToCamelCase(result),
      "Floor plan price list item map updated successfully.",
    );
  } catch (error) {
    console.error("Update Floor Plan Price List Item Map Error:", error);
    return handleControllerError(res, error,
      error.message || "Internal server error.",
    );
  }
}

export async function deleteFloorPlanPricelistItemMap(req, res) {
  try {
    const { id } = req.params;
    const { builder_id: builderId, company_id: companyId } = req.user;

    if (!id) {
      return errorResponse(res, 400, "id is required.");
    }

    await deleteFloorPlanPricelistItemMapService({ id, builderId, companyId });

    return successResponse(
      res,
      {},
      "Floor plan price list item map deleted successfully.",
    );
  } catch (error) {
    console.error("Delete Floor Plan Price List Item Map Error:", error);
    return handleControllerError(res, error, "Internal server error.");
  }
}
