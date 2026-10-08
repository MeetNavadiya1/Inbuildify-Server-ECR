import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import {
  createSupplierTypeMapService,
  getAllSupplierTypeMapsService,
  updateSupplierTypeMapService,
  deleteSupplierSupplierTypeMapService,
  createSupplierTypeConstructionChecklistMapService,
  deleteSupplierTypeConstructionChecklistMapService,
  getAllSupplierTypeConstructionChecklistMapsService,
} from "./supplier-supplier-type-map.service.js";

/**
 * Handle supplier type mapping creation
 */
export async function createSupplierTypeMap(req, res) {
  try {
    const builderId = req.user?.builder_id;
    if (!builderId) {
      return errorResponse(res, 401, "Unauthorized: Missing builder ID.");
    }

    const result = await createSupplierTypeMapService({
      builderId,
      payload: req.body,
    });

    return successResponse(res, result, "Supplier type mapping created successfully.");
  } catch (error) {
    console.error("Error creating supplier type mapping:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

/**
 * Handle fetching all supplier type mappings
 */
export async function getAllSupplierTypeMaps(req, res) {
  try {
    const builderId = req.user?.builder_id;
    if (!builderId) {
      return errorResponse(res, 401, "Unauthorized: Missing builder ID.");
    }

    const result = await getAllSupplierTypeMapsService({
      builderId,
      queryParams: req.query,
    });

    return successResponse(res, result, "Supplier type maps fetched successfully.");
  } catch (error) {
    console.error("Error fetching supplier type maps:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

/**
 * Handle supplier type mapping update
 */
export async function updateSupplierTypeMap(req, res) {
  try {
    const builderId = req.user?.builder_id;
    if (!builderId) {
      return errorResponse(res, 401, "Unauthorized: Missing builder ID.");
    }

    const { id } = req.params;
    const result = await updateSupplierTypeMapService({
      builderId,
      id,
      payload: req.body,
    });

    return successResponse(res, result, "Supplier type mapping updated successfully.");
  } catch (error) {
    console.error("Error updating supplier type mapping:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

/**
 * Handle supplier type mapping deletion
 */
export async function deleteSupplierSupplierTypeMap(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const { id } = req.params;

    if (!id) {
      return errorResponse(res, 400, "id is required");
    }

    await deleteSupplierSupplierTypeMapService({
      builderId,
      id,
    });

    return successResponse(res, 200, "Record deleted successfully", null);
  } catch (error) {
    console.error("Error deleting supplier type mapping:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

/**
 * Handle construction checklist mapping creation
 */
export async function createSupplierTypeConstructionChecklistMap(req, res) {
  try {
    const builderId = req.user?.builder_id;
    if (!builderId) {
      return errorResponse(res, 401, "Unauthorized: Missing builder ID.");
    }

    const result = await createSupplierTypeConstructionChecklistMapService({
      builderId,
      payload: req.body,
    });

    return successResponse(res, result, "Supplier type construction checklist mapping created successfully.");
  } catch (error) {
    console.error("Error creating supplier type construction checklist mapping:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

/**
 * Handle construction checklist mapping deletion
 */
export async function deleteSupplierTypeConstructionChecklistMap(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const { id } = req.params;

    if (!id) {
      return errorResponse(res, 400, "ID is required");
    }

    await deleteSupplierTypeConstructionChecklistMapService({
      builderId,
      id,
    });

    return successResponse(res, 200, "Mapping deleted successfully", null);
  } catch (error) {
    console.error("Error deleting supplier type construction checklist mapping:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

/**
 * Handle fetching all construction checklist mappings
 */
export async function getAllSupplierTypeConstructionChecklistMaps(req, res) {
  try {
    const builderId = req.user?.builder_id;
    if (!builderId) {
      return errorResponse(res, 401, "Unauthorized: Missing builder ID.");
    }

    const result = await getAllSupplierTypeConstructionChecklistMapsService({
      builderId,
      queryParams: req.query,
    });

    return successResponse(res, result, "Supplier type construction checklist maps fetched successfully.");
  } catch (error) {
    console.error("Error fetching supplier type construction checklist maps:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}
