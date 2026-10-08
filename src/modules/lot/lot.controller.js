import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import lotService, { getLotByIdService, createLotService, updateLotService } from "./lot.service.js";

export async function createLot(req, res) {
  try {
    const userId = req.user?.users_id;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    const data = await createLotService({
      userId,
      builderId,
      companyId,
      data: req.body,
    });

    return successResponse(
      res,
      data,
      "Lot created successfully",
    );
  } catch (error) {
    console.error("Create lot error:", error);
    return handleControllerError(res, error,
      error.message || "Internal server error",
    );
  }
}

/**
 * Retrieves a list of all lots with advanced filtering.
 */
export async function getAllLots(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId && !companyId) {
      return errorResponse(res, 401, "Unauthorized: User must belong to either a builder or company");
    }

    const lots = await lotService.getAllLotsService({
      builderId,
      companyId,
      query: req.query,
    });

    return successResponse(res, lots, "Lots retrieved successfully");
  } catch (error) {
    console.error("Get all lots error:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function getLotById(req, res) {
  try {
    const { lot_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    const data = await getLotByIdService({
      lotId: lot_id,
      builderId,
      companyId,
    });

    if (!data) {
      return successResponse(res, "Lot retrieved successfully.");
    }

    return successResponse(
      res,
      data,
      "Lot retrieved successfully",
    );
  } catch (error) {
    console.error("Get lot by ID error:", error);
    return handleControllerError(res, error,
      error.message || "Internal server error",
    );
  }
}

export async function updateLot(req, res) {
  try {
    const { lot_id } = req.params;
    const userId = req.user?.users_id;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    const data = await updateLotService({
      lotId: lot_id,
      userId,
      builderId,
      companyId,
      data: req.body,
    });

    return successResponse(
      res,
      data,
      "Lot updated successfully",
    );
  } catch (error) {
    console.error("Update lot error:", error);
    return handleControllerError(res, error,
      error.message || "Internal server error",
    );
  }
}

export async function deleteLot(req, res) {
  try {
    const { lot_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    await lotService.deleteLotService({
      lotId: lot_id,
      builderId,
      companyId,
    });

    return successResponse(
      res,
      "Lot deleted successfully",
    );
  } catch (error) {
    console.error("Delete lot error:", error);
    return handleControllerError(res, error,
      error.message || "Internal server error",
    );
  }
}
