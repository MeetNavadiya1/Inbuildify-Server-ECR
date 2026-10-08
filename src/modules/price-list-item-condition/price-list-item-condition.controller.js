import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import {
  createPriceListItemConditionService,
  getAllPriceListItemConditionsService,
  getPriceListItemConditionByIdService,
  updatePriceListItemConditionService,
  deletePriceListItemConditionService,
} from "./price-list-item-condition.service.js";

// ─── Shared guard ─────────────────────────────────────────────────────────────

/** Returns true when both builder_id and company_id are absent from user context. */
function missingUserContext(builderId, companyId) {
  return !builderId && !companyId;
}

// ─── CREATE PRICE LIST ITEM CONDITION ────────────────────────────────────────

export async function createPriceListItemCondition(req, res) {
  try {
    const { company_id: companyId, builder_id: builderId } = req.user;

    if (missingUserContext(builderId, companyId)) {
      return errorResponse(res, 401, "Unauthorized: Builder or Company ID missing.");
    }

    const { price_list_item_id, condition_name, status, range_start, range_end } = req.body;

    if (!price_list_item_id) {
      return errorResponse(res, 400, "price_list_item_id is required");
    }

    if (!condition_name) {
      return errorResponse(res, 400, "condition_name is required");
    }

    const result = await createPriceListItemConditionService({
      companyId,
      builderId,
      price_list_item_id,
      condition_name,
      status,
      range_start,
      range_end,
    });

    if (result.error) {
      return errorResponse(res, result.error.status, result.error.message);
    }

    return successResponse(res, result.data, "Price list item condition created successfully");
  } catch (error) {
    console.error("Error creating price list item condition:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

// ─── GET ALL PRICE LIST ITEM CONDITIONS ──────────────────────────────────────

export async function getAllPriceListItemConditions(req, res) {
  try {
    const { company_id: companyId, builder_id: builderId } = req.user;

    if (missingUserContext(builderId, companyId)) {
      return errorResponse(res, 401, "Unauthorized: Builder or Company ID missing.");
    }

    const { price_list_item_id } = req.query;

    const result = await getAllPriceListItemConditionsService({
      companyId,
      builderId,
      price_list_item_id,
    });

    return successResponse(res, result.data, "Price list item conditions fetched successfully");
  } catch (error) {
    console.error("Error fetching price list item conditions:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

// ─── GET PRICE LIST ITEM CONDITION BY ID ─────────────────────────────────────

export async function getPriceListItemConditionById(req, res) {
  try {
    const { price_list_item_condition_id } = req.params;
    const { company_id: companyId, builder_id: builderId } = req.user;

    if (!price_list_item_condition_id) {
      return errorResponse(res, 400, "price_list_item_condition_id is required");
    }

    if (missingUserContext(builderId, companyId)) {
      return errorResponse(res, 401, "Unauthorized: Builder or Company ID missing.");
    }

    const result = await getPriceListItemConditionByIdService({
      price_list_item_condition_id,
      companyId,
      builderId,
    });

    if (result.error) {
      return errorResponse(res, result.error.status, result.error.message);
    }

    return successResponse(res, result.data, "Price list item condition fetched successfully");
  } catch (error) {
    console.error("Error fetching price list item condition:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

// ─── UPDATE PRICE LIST ITEM CONDITION ────────────────────────────────────────

export async function updatePriceListItemCondition(req, res) {
  try {
    const { price_list_item_condition_id } = req.params;
    const { company_id: companyId, builder_id: builderId } = req.user;

    if (!price_list_item_condition_id) {
      return errorResponse(res, 400, "price_list_item_condition_id is required");
    }

    if (missingUserContext(builderId, companyId)) {
      return errorResponse(res, 401, "Unauthorized: Builder or Company ID missing.");
    }

    const { condition_name, status, range_start, range_end } = req.body;

    const result = await updatePriceListItemConditionService({
      price_list_item_condition_id,
      companyId,
      builderId,
      condition_name,
      status,
      range_start,
      range_end,
    });

    if (result.error) {
      return errorResponse(res, result.error.status, result.error.message);
    }

    return successResponse(res, result.data, "Price list item condition updated successfully");
  } catch (error) {
    console.error("Error updating price list item condition:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

// ─── DELETE PRICE LIST ITEM CONDITION ────────────────────────────────────────

export async function deletePriceListItemCondition(req, res) {
  try {
    const { price_list_item_condition_id } = req.params;
    const { company_id: companyId, builder_id: builderId } = req.user;

    if (!price_list_item_condition_id) {
      return errorResponse(res, 400, "price_list_item_condition_id is required");
    }

    if (missingUserContext(builderId, companyId)) {
      return errorResponse(res, 401, "Unauthorized: Builder or Company ID missing.");
    }

    const result = await deletePriceListItemConditionService({
      price_list_item_condition_id,
      companyId,
      builderId,
    });

    if (result.error) {
      return errorResponse(res, result.error.status, result.error.message);
    }

    return successResponse(res, null, "Price list item condition deleted successfully");
  } catch (error) {
    console.error("Error deleting price list item condition:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}


