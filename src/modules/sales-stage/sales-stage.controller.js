import { errorResponse, successResponse, handleControllerError } from "../../helper/response.js";
import {
  createSalesStageService,
  getAllSalesStagesService,
  deleteSalesStageService,
  updateSalesStageService,
  updateSalesStageIsActiveService,
  getSalesStagesBySalesProcessIdService,
} from "./sales-stage.service.js";

/**
 * Create a new Sales Stage
 */
export async function createSalesStage(req, res) {
  try {
    const result = await createSalesStageService(req.body, req.user);
    return successResponse(res, result, "Sales stage created successfully.");
  } catch (error) {
    console.error("Error creating sales stage:", error);
    return handleControllerError(res, error, error?.message || "Internal Server Error");
  }
}

/**
 * Fetch all Sales Stages for a builder
 */
export async function getAllSalesStages(req, res) {
  try {
    const builderId = req.user?.builder_id;
    if (!builderId) {
      return errorResponse(res, 403, "Unauthorized. Builder ID missing.");
    }

    const result = await getAllSalesStagesService(builderId);
    return successResponse(res, result, "Sales stages fetched successfully.");
  } catch (error) {
    console.error("Error fetching sales stages:", error);
    return handleControllerError(res, error, error?.message || "Internal Server Error");
  }
}

/**
 * Delete a Sales Stage
 */
export async function deleteSalesStage(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const { sales_stage_id } = req.params;

    if (!builderId) {
      return errorResponse(res, 401, "Unauthorized: Builder ID missing.");
    }
    if (!sales_stage_id) {
      return errorResponse(res, 400, "sales_stage_id is required.");
    }

    await deleteSalesStageService(sales_stage_id, builderId);
    return successResponse(res, null, "Sales stage permanently deleted successfully.");
  } catch (error) {
    console.error("Error deleting sales stage:", error);
    return handleControllerError(res, error, error?.message || "Internal Server Error");
  }
}

/**
 * Update a Sales Stage
 */
export async function updateSalesStage(req, res) {
  try {
    const { sales_stage_id } = req.params;
    const result = await updateSalesStageService(sales_stage_id, req.body, req.user);
    return successResponse(res, result, "Sales stage updated successfully.");
  } catch (error) {
    console.error("Error updating sales stage:", error);
    return handleControllerError(res, error, error?.message || "Internal Server Error");
  }
}

/**
 * Update Sales Stage Active Status
 */
export async function updateSalesStageIsActive(req, res) {
  try {
    const { sales_stage_id } = req.params;
    const { is_active } = req.body;

    const result = await updateSalesStageIsActiveService(sales_stage_id, is_active, req.user);
    return successResponse(res, result, "Sales stage status updated successfully.");
  } catch (error) {
    console.error("Error updating sales stage is_active:", error);
    return handleControllerError(res, error, error?.message || "Internal Server Error");
  }
}

/**
 * Get Sales Stages by Sales Process ID
 */
export async function getSalesStagesBySalesProcessId(req, res) {
  try {
    const { sales_process_id } = req.query;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    const result = await getSalesStagesBySalesProcessIdService(
      sales_process_id,
      builderId,
      companyId,
    );
    return successResponse(res, result, "Sales stages fetched successfully.");
  } catch (error) {
    console.error("Error fetching sales stages:", error);
    return handleControllerError(res, error, error?.message || "Internal Server Error");
  }
}
