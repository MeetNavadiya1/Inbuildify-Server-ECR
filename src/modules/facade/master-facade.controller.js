import { errorResponse, successResponse } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  createMasterFacadeService,
  getMasterFacadesService,
  getMasterFacadeByIdService,
  updateMasterFacadeService,
  deleteMasterFacadeService,
  toggleCollabService,
  getPublicCollabFacadesService,
} from "./master-facade.service.js";

// ... (previous functions)

/**
 * Toggle is_collab status for a Master Facade
 */
export async function toggleMasterFacadeCollab(req, res) {
  try {
    const { id } = req.params;
    const builderId = req.user.builder_id;
    const result = await toggleCollabService(id, builderId);

    return successResponse(
      res,
      keysToCamelCase(result),
      "Facade collab status toggled successfully.",
    );
  } catch (error) {
    console.error("Toggle collab status error:", error);
    const statusCode = error.statusCode || 500;
    return errorResponse(res, statusCode, error.message || "Internal Server Error");
  }
}

/**
 * Get all Master Facades where is_collab is true
 * PUBLIC API
 */
export async function getPublicCollabFacades(req, res) {
  try {
    const result = await getPublicCollabFacadesService();

    return successResponse(
      res,
      keysToCamelCase(result),
      "Public collab facades fetched successfully.",
    );
  } catch (error) {
    console.error("Get public collab facades error:", error);
    const statusCode = error.statusCode || 500;
    return errorResponse(res, statusCode, error.message || "Internal Server Error");
  }
}

/**
 * Fetch all Master Facades with filtering and pagination
 */
export async function getMasterFacades(req, res) {
  try {
    const builderId = req.user.builder_id;
    const companyId = req.user.company_id;

    const result = await getMasterFacadesService(req.query, builderId, companyId);

    return successResponse(
      res,
      {
        facades: keysToCamelCase(result.facades),
        pagination: result.pagination,
      },
      "Facades fetched successfully.",
    );
  } catch (error) {
    console.error("Get Facades error:", error);
    const statusCode = error.statusCode || 500;
    return errorResponse(res, statusCode, error.message || "Internal Server Error");
  }
}

/**
 * Fetch a single Master Facade by ID
 */
export async function getMasterFacadeById(req, res) {
  try {
    const { id } = req.params;
    const builderId = req.user.builder_id;
    const facade = await getMasterFacadeByIdService(id, builderId);

    return successResponse(
      res,
      keysToCamelCase(facade),
      "Facade fetched successfully.",
    );
  } catch (error) {
    console.error("Get facade by ID error:", error);
    const statusCode = error.statusCode || 500;
    return errorResponse(res, statusCode, error.message || "Internal Server Error");
  }
}

/**
 * Create a new Master Facade
 */
export async function createMasterFacade(req, res) {
  try {
    const newFacade = await createMasterFacadeService(req.body, req.user, req.file);

    return successResponse(
      res,
      keysToCamelCase(newFacade),
      "Facade created successfully.",
    );
  } catch (error) {
    console.error("Create Facade Error:", error);
    const statusCode = error.statusCode || 500;
    return errorResponse(res, statusCode, error.message || "Internal Server Error");
  }
}

/**
 * Update a Master Facade
 */
export async function updateMasterFacade(req, res) {
  try {
    const { facade_id } = req.params;
    const updatedFacade = await updateMasterFacadeService(facade_id, req.body, req.user, req.file);

    return successResponse(
      res,
      keysToCamelCase(updatedFacade),
      "Facade updated successfully.",
    );
  } catch (error) {
    console.error("Update Facade Error:", error);
    const statusCode = error.statusCode || 500;
    return errorResponse(res, statusCode, error.message || "Internal Server Error");
  }
}

/**
 * Delete a Master Facade
 */
export async function deleteMasterFacade(req, res) {
  try {
    const { facade_id } = req.params;
    const builderId = req.user.builder_id;
    await deleteMasterFacadeService(facade_id, builderId);

    return successResponse(res, {}, "Master Facade deleted successfully.");
  } catch (error) {
    console.error("Error deleting master facade:", error);
    const statusCode = error.statusCode || 500;
    return errorResponse(res, statusCode, error.message || "Internal Server Error");
  }
}
