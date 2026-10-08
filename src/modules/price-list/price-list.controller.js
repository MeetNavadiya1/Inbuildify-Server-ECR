
import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import {
  createPriceListService,
  getAllPriceListService,
  deletePriceListService,
  updatePriceListService,
  toggleSuggestedPriceListService,
} from "./price-list.service.js";

// ─── Shared guard ─────────────────────────────────────────────────────────────

/** Returns true when both builder_id and company_id are absent from user context. */
function missingUserContext(builderId, companyId) {
  return !builderId && !companyId;
}

// ─── CREATE PRICE LIST ────────────────────────────────────────────────────────

export async function createPriceList(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.user_id;

    if (missingUserContext(builderId, companyId)) {
      return errorResponse(res, 401, "Unauthorized: Builder or Company ID missing.");
    }

    const { name, sort_order, show_in_view_list, location } = req.body;

    if (!name || name.trim() === "") {
      return errorResponse(res, 400, "Name is required.");
    }

    const result = await createPriceListService({
      companyId,
      builderId,
      userId,
      name,
      sort_order,
      show_in_view_list,
      location,
    });

    if (result.error) {
      return errorResponse(res, result.error.status, result.error.message);
    }

    return successResponse(res, result.data, "Price list created successfully.");
  } catch (error) {
    console.error("Error creating price list:", error);
    return handleControllerError(res, error, error?.message || "Internal Server Error.");
  }
}

// ─── GET ALL PRICE LISTS ──────────────────────────────────────────────────────

export async function getAllPriceList(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.users_id;

    if (missingUserContext(builderId, companyId)) {
      return errorResponse(res, 401, "Unauthorized: Builder or Company ID missing.");
    }

    const { page, limit, is_active, is_suggested, search, location_id } = req.query;

    const result = await getAllPriceListService({
      companyId,
      builderId,
      userId,
      page,
      limit,
      is_active,
      is_suggested,
      search,
      location_id,
    });

    return successResponse(res, result.data, "Price list fetched successfully.");
  } catch (error) {
    console.error("Error fetching price list:", error);
    return handleControllerError(res, error, error?.message || "Internal Server Error.");
  }
}

// ─── DELETE PRICE LIST ────────────────────────────────────────────────────────

export async function deletePriceList(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const { priceListId } = req.params;

    if (!priceListId) {
      return errorResponse(res, 400, "priceListId is required.");
    }

    if (missingUserContext(builderId, companyId)) {
      return errorResponse(res, 401, "Unauthorized: Builder or Company ID missing.");
    }

    const result = await deletePriceListService({ companyId, builderId, priceListId });

    if (result.error) {
      return errorResponse(res, result.error.status, result.error.message);
    }

    return successResponse(res, null, "Price list deleted successfully.");
  } catch (error) {
    console.error("Error deleting price list:", error);
    return handleControllerError(res, error, error?.message || "Internal Server Error.");
  }
}

// ─── UPDATE PRICE LIST ────────────────────────────────────────────────────────

export async function updatePriceList(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.user_id;
    const { priceListId } = req.params;

    if (!priceListId) {
      return errorResponse(res, 400, "priceListId is required.");
    }

    if (missingUserContext(builderId, companyId)) {
      return errorResponse(res, 401, "Unauthorized: Builder or Company ID missing.");
    }

    const { name, sort_order, show_in_view_list, is_active, location } = req.body;

    const result = await updatePriceListService({
      companyId,
      builderId,
      userId,
      priceListId,
      name,
      sort_order,
      show_in_view_list,
      is_active,
      location,
    });

    if (result.error) {
      return errorResponse(res, result.error.status, result.error.message);
    }

    return successResponse(res, result.data, "Price list updated successfully.");
  } catch (error) {
    console.error("Error updating price list:", error);
    return handleControllerError(res, error, error?.message || "Internal Server Error.");
  }
}

// ─── TOGGLE SUGGESTED PRICE LIST ─────────────────────────────────────────────

export async function toggleSuggestedPriceList(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.users_id;
    const { priceListId } = req.params;

    if (!priceListId) {
      return errorResponse(res, 400, "priceListId is required.");
    }

    if (missingUserContext(builderId, companyId)) {
      return errorResponse(res, 401, "Unauthorized: Builder or Company ID missing.");
    }

    const result = await toggleSuggestedPriceListService({
      companyId,
      builderId,
      priceListId,
      userId,
    });

    if (result.error) {
      return errorResponse(res, result.error.status, result.error.message);
    }

    return successResponse(
      res,
      result.data,
      "Price list is_suggested status updated successfully.",
    );
  } catch (error) {
    console.error("Error toggling is_suggested price list:", error);
    return handleControllerError(res, error, error?.message || "Internal Server Error.");
  }
}
