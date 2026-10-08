
import { errorResponse, successResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  getAllPackageCommissionMapsService,
  getAllPriceListItemMapsService,
  createPriceListItemMapService,
  updatePriceListItemMapService,
  deletePriceListItemMapService,
  createPackageCommissionMapService,
  updatePackageCommissionMapService,
  deletePackageCommissionMapService,
  getPackageCommissionMapsService,
  getPriceListItemMapsService,
} from "./h-l-package-pricelist-item-commission.service.js";

export async function createPriceListItemMap(req, res) {
  try {
    const { house_land_package_id, price_list_item_id, quantity, note } = req.body;
    const userId = req.user?.users_id;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    const result = await createPriceListItemMapService({
      houseLandPackageId: house_land_package_id,
      priceListItemId: price_list_item_id,
      quantity,
      note,
      userContext: { userId, builderId, companyId },
    });

    return successResponse(
      res,
      result,
      "Price list item mapping created successfully",
    );
  } catch (error) {
    console.error("Create price list item mapping error:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

/**
 * Retrieves price list item mappings and totals for a specific house land package.
 */
export async function getPriceListItemMaps(req, res) {
  try {
    const { house_land_package_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    const data = await getPriceListItemMapsService({
      houseLandPackageId: house_land_package_id,
      userContext: { builderId, companyId },
    });

    if (!data) {
      return successResponse(res, [], "Package not found");
    }

    return successResponse(res, data, "Price list item mappings fetched successfully");
  } catch (error) {
    console.error("Get price list item mappings error:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function getAllPriceListItemMaps(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId && !companyId) {
      return errorResponse(res, 401, "Unauthorized");
    }

    const { mappings, houseTotal, commissionTotal } = await getAllPriceListItemMapsService({
      builderId,
      companyId,
    });

    return successResponse(
      res,
      {
        mappings,
        houseTotal,
        commissionTotal,
      },
      "All price list item mappings fetched successfully",
    );
  } catch (error) {
    console.error("Get all price list item mappings error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function updatePriceListItemMap(req, res) {
  try {
    const { id } = req.params;
    const { quantity, note } = req.body;
    const userId = req.user?.users_id;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    const result = await updatePriceListItemMapService({
      id,
      quantity,
      note,
      userContext: { userId, builderId, companyId },
    });

    return successResponse(
      res,
      result,
      "Price list item mapping updated successfully",
    );
  } catch (error) {
    console.error("Update price list item mapping error:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function deletePriceListItemMap(req, res) {
  try {
    const { id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    const result = await deletePriceListItemMapService({
      id,
      userContext: { builderId, companyId },
    });

    return successResponse(
      res,
      result,
      "Price list item mapping deleted successfully",
    );
  } catch (error) {
    console.error("Delete price list item mapping error:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

// --- Package Commission Map CRUD ---

export async function createPackageCommissionMap(req, res) {
  try {
    const { house_land_package_id, job_commission_id } = req.body;
    const userId = req.user?.users_id;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId && !companyId) {
      return errorResponse(res, 401, "Unauthorized");
    }

    const result = await createPackageCommissionMapService({
      houseLandPackageId: house_land_package_id,
      jobCommissionId: job_commission_id,
      userContext: { userId, builderId, companyId },
    });

    return successResponse(
      res,
      result,
      "Package commission mapping created successfully",
    );
  } catch (error) {
    console.error("Create package commission mapping error:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

/**
 * Retrieves commission mappings and totals for a specific house land package.
 */
export async function getPackageCommissionMaps(req, res) {
  try {
    const { house_land_package_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    const data = await getPackageCommissionMapsService({
      houseLandPackageId: house_land_package_id,
      userContext: { builderId, companyId },
    });

    if (!data) {
      return successResponse(res, [], "Package not found");
    }

    return successResponse(res, data, "Package commission mappings fetched successfully");
  } catch (error) {
    console.error("Get package commission mappings error:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function getAllPackageCommissionMaps(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId && !companyId) {
      return errorResponse(res, 401, "Unauthorized");
    }

    const { mappings, commissionTotal } = await getAllPackageCommissionMapsService({
      builderId,
      companyId,
    });

    return successResponse(
      res,
      {
        mappings,
        commissionTotal,
      },
      "All package commission mappings fetched successfully",
    );
  } catch (error) {
    console.error("Get all package commission mappings error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function updatePackageCommissionMap(req, res) {
  try {
    const { id } = req.params;
    const { job_commission_id } = req.body;
    const userId = req.user?.users_id;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    const result = await updatePackageCommissionMapService({
      id,
      jobCommissionId: job_commission_id,
      userContext: { userId, builderId, companyId },
    });

    return successResponse(
      res,
      result,
      "Package commission mapping updated successfully",
    );
  } catch (error) {
    console.error("Update package commission mapping error:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function deletePackageCommissionMap(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user?.users_id;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    const result = await deletePackageCommissionMapService({
      id,
      userContext: { userId, builderId, companyId },
    });

    return successResponse(
      res,
      result,
      "Package commission mapping deleted successfully",
    );
  } catch (error) {
    console.error("Delete package commission mapping error:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}
