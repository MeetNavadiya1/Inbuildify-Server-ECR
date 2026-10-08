import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import {
  createSupplierTypeService,
  getAllSupplierTypeService,
  deleteSupplierTypeService,
  updateSupplierTypeService,
} from "./supplier-type.service.js";

/**
 * Handle supplier type creation
 */
export async function createSupplierType(req, res) {
  try {
    const companyId = req.user?.company_id;
    const builderId = req.user?.builder_id;
    const userId = req.user?.user_id;

    if (!companyId && !builderId) {
      return errorResponse(res, 401, "Unauthorized: Scope missing.");
    }

    const result = await createSupplierTypeService({
      builderId,
      companyId,
      userId,
      payload: req.body,
    });

    return successResponse(res, result, "Supplier type created successfully.");
  } catch (error) {
    console.error("Error creating supplier type:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

/**
 * Handle fetching all supplier types
 */
export async function getAllSupplierType(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId && !companyId) {
      return errorResponse(res, 401, "Unauthorized: Scope missing.");
    }

    const result = await getAllSupplierTypeService({
      builderId,
      companyId,
      queryParams: req.query,
    });

    return successResponse(res, result, "Supplier types fetched successfully.");
  } catch (error) {
    console.error("Error fetching supplier types:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

/**
 * Handle supplier type deletion
 */
export async function deleteSupplierType(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const { supplier_type_id } = req.params;

    if (!supplier_type_id) {
      return errorResponse(res, 400, "Supplier type ID is required.");
    }

    await deleteSupplierTypeService({
      builderId,
      companyId,
      id: supplier_type_id,
    });

    return successResponse(res, null, "Supplier type deleted successfully.");
  } catch (error) {
    console.error("Error deleting supplier type:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

/**
 * Handle supplier type update
 */
export async function updateSupplierType(req, res) {
  try {
    const { supplier_type_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.user_id;

    if (!supplier_type_id) {
      return errorResponse(res, 400, "Supplier type ID is required.");
    }

    const result = await updateSupplierTypeService({
      builderId,
      companyId,
      userId,
      id: supplier_type_id,
      payload: req.body,
    });

    return successResponse(res, result, "Supplier type updated successfully.");
  } catch (error) {
    console.error("Error updating supplier type:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}
