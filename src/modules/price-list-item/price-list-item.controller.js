import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  createPriceListItemService,
  getAllPriceListItemsService,
  deletePriceListItemService,
  updatePriceListItemService,
  copyPriceListItemService,
  formatItemResponse,
} from "./price-list-item.service.js";

// ─── Shared guard ─────────────────────────────────────────────────────────────

/** Returns true when both builder_id and company_id are absent from user context. */
function missingUserContext(builderId, companyId) {
  return !builderId && !companyId;
}

// ─── CREATE PRICE LIST ITEM ────────────────────────────────────────────
// ───────

export async function createPriceListItem(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.user_id;

    if (missingUserContext(builderId, companyId)) {
      return errorResponse(res, 401, "Unauthorized: Builder or Company ID missing.");
    }

    const {
      price_list_id,
      item_description,
      short_description,
      cost_type,
      cost_type_text,
      cost_option,
      cost,
      builder_cost,
      sort_order,
      uom,
      status,
      include_by_default,
      allow_remove_from_quotation,
      show_in_hl_package,
      show_only_in_package,
      range_id,
      dwelling_type_id,
      additional_item,
      conditions,
    } = req.body;

    const result = await createPriceListItemService({
      builderId,
      companyId,
      userId,
      price_list_id,
      item_description,
      short_description,
      cost_type,
      cost_type_text,
      cost_option,
      cost,
      builder_cost,
      sort_order,
      uom,
      status,
      include_by_default,
      allow_remove_from_quotation,
      show_in_hl_package,
      show_only_in_package,
      range_id,
      dwelling_type_id,
      additional_item,
      conditions,
    });

    if (result.error) {
      return errorResponse(res, result.error.status, result.error.message);
    }

    return successResponse(res, result.data, "Price list item created successfully.");
  } catch (error) {
    console.error("Error creating price list item:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error.");
  }
}

// ─── GET ALL PRICE LIST ITEMS ─────────────────────────────────────────────────

export async function getAllPriceListItems(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (missingUserContext(builderId, companyId)) {
      return errorResponse(res, 401, "Unauthorized: Builder or Company ID missing.");
    }

    const {
      page,
      limit,
      status,
      cost_option,
      cost_type,
      uom,
      price,
      item_description,
      price_list_id,
      dwelling_type_id,
      is_system_data,
      range_id,
      location_id,
      sort_order,
      search,
      package_id,
      extra_item,
    } = req.query;

    const { priceListItems, pagination } = await getAllPriceListItemsService({
      builder_id: builderId,
      company_id: companyId,
      page,
      limit,
      status,
      cost_option,
      cost_type,
      uom,
      price,
      item_description,
      price_list_id,
      dwelling_type_id,
      range_id,
      location_id,
      sort_order,
      search,
      package_id,
      is_system_data,
      extra_item,
    });

    const formattedItems = priceListItems.map((item) => {
      const camelItem = keysToCamelCase(item);
      return formatItemResponse(camelItem);
    });

    return successResponse(
      res,
      { priceListItem: formattedItems, pagination },
      "Price list items fetched successfully.",
    );
  } catch (error) {
    console.error("Error fetching price list items:", error);
    return handleControllerError(res, error, error?.message || "Internal Server Error.");
  }
}

// ─── DELETE PRICE LIST ITEM ───────────────────────────────────────────────────

export async function deletePriceListItem(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const { priceListItemId } = req.params;

    if (!priceListItemId) {
      return errorResponse(res, 400, "priceListItemId is required.");
    }

    if (missingUserContext(builderId, companyId)) {
      return errorResponse(res, 401, "Unauthorized: Builder or Company ID missing.");
    }

    const result = await deletePriceListItemService({
      builderId,
      companyId,
      priceListItemId,
    });

    if (result.error) {
      return errorResponse(res, result.error.status, result.error.message);
    }

    return successResponse(res, null, "Price list item deleted successfully.");
  } catch (error) {
    console.error("Error deleting price list item:", error);
    return handleControllerError(res, error, "Error deleting price list item.");
  }
}

// ─── UPDATE PRICE LIST ITEM ───────────────────────────────────────────────────

export async function updatePriceListItem(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.user_id;
    const { price_list_item_id } = req.params;

    if (!price_list_item_id) {
      return errorResponse(res, 400, "price_list_item_id is required.");
    }

    if (missingUserContext(builderId, companyId)) {
      return errorResponse(res, 401, "Unauthorized: Builder or Company ID missing.");
    }

    const {
      item_description,
      short_description,
      cost_type,
      cost_type_text,
      cost_option,
      cost,
      builder_cost,
      sort_order,
      uom,
      status,
      include_by_default,
      allow_remove_from_quotation,
      show_in_hl_package,
      show_only_in_package,
      range_id,
      dwelling_type_id,
      conditions,
    } = req.body;

    const result = await updatePriceListItemService({
      builderId,
      companyId,
      userId,
      price_list_item_id,
      requestBody: req.body,
      item_description,
      short_description,
      cost_type,
      cost_type_text,
      cost_option,
      cost,
      builder_cost,
      sort_order,
      uom,
      status,
      include_by_default,
      allow_remove_from_quotation,
      show_in_hl_package,
      show_only_in_package,
      range_id,
      dwelling_type_id,
      conditions,
    });

    if (result.error) {
      return errorResponse(res, result.error.status, result.error.message);
    }

    return successResponse(res, result.data, "Price list item updated successfully.");
  } catch (error) {
    console.error("Error updating price list item:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error.");
  }
}
export async function copyPriceListItem(req, res) {
  try {
    const { price_list_item_id } = req.params;
    const { price_list_id, item_description, sort_order } = req.body;
    const userId = req.user.user_id;
    const builderId = req.user.builder_id;
    const companyId = req.user.company_id;

    if (missingUserContext(builderId, companyId)) {
      return errorResponse(res, 401, "Unauthorized: Builder or Company ID missing.");
    }

    const { data, error } = await copyPriceListItemService({
      priceListItemId: price_list_item_id,
      price_list_id,
      item_description,
      sort_order,
      userId,
      builderId,
      companyId,
    });

    if (error) {
      return errorResponse(res, error.status, error.message);
    }

    // Use the service to fetch the formatted item
    return successResponse(
      res,
      formatItemResponse(data),
      "Price list item copied successfully.",
    );
  } catch (error) {
    console.error("Error copying price list item:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}
