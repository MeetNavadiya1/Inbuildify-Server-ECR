import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  createHlPackageLotPackageMapService,
  getLotPackagesByHlPackageIdService,
  deleteHlPackageLotPackageMapService,
  getAllHlPackageLotPackageMapsService,
} from "./hl-package-lot-package-map.service.js";

export async function createHlPackageLotPackageMap(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId && !companyId) {
      return errorResponse(res, 401, "Unauthorized: User must belong to either a builder or company");
    }

    const result = await createHlPackageLotPackageMapService(req.body, companyId, builderId);
    
    return successResponse(
      res,
      keysToCamelCase(result.get({ plain: true })),
      "Mapping created successfully"
    );
  } catch (error) {
    console.error("Create HL Package Lot Package Map error:", error);
    const statusCode = error.statusCode || 500;
    return errorResponse(res, statusCode, error.message || "Internal server error");
  }
}

export async function getLotPackagesByHlPackageId(req, res) {
  try {
    const { house_land_package_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId && !companyId) {
      return errorResponse(res, 401, "Unauthorized: User must belong to either a builder or company");
    }

    const result = await getLotPackagesByHlPackageIdService(house_land_package_id, companyId, builderId);

    return successResponse(
      res,
      keysToCamelCase(result),
      "Linked lot packages retrieved successfully"
    );
  } catch (error) {
    console.error("Get Lot Packages by HL Package ID error:", error);
    const statusCode = error.statusCode || 500;
    return errorResponse(res, statusCode, error.message || "Internal server error");
  }
}

export async function deleteHlPackageLotPackageMap(req, res) {
  try {
    const { id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId && !companyId) {
      return errorResponse(res, 401, "Unauthorized: User must belong to either a builder or company");
    }

    const result = await deleteHlPackageLotPackageMapService(id, companyId, builderId);

    if (result && result.success === false) {
      return successResponse(res, null, result.message);
    }

    return successResponse(res, null, "Mapping deleted successfully");
  } catch (error) {
    console.error("Delete HL Package Lot Package Map error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function getAllHlPackageLotPackageMaps(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId && !companyId) {
      return errorResponse(res, 401, "Unauthorized: User must belong to either a builder or company");
    }

    const { page = 1, limit = 25 } = req.query;

    const result = await getAllHlPackageLotPackageMapsService(companyId, builderId, page, limit);

    return successResponse(res, {
      mappings: keysToCamelCase(result.mappings),
      pagination: result.pagination,
    }, "All mappings retrieved successfully");
  } catch (error) {
    console.error("Get all HL Package Lot Package Maps error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}
