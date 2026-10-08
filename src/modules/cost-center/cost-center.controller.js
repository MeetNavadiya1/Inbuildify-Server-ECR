import costCenterService from "./cost-center.service.js";
import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";

/**
 * CREATE COST CENTER
 */
export async function createCostCenter(req, res) {
  try {
    const { builder_id, company_id, users_id } = req.user;
    const costCenter = await costCenterService.createCostCenter(
      req.body,
      builder_id,
      company_id,
      users_id,
    );

    return successResponse(
      res,
      costCenter,
      "Cost center created successfully",
      201,
    );
  } catch (error) {
    console.error("Error creating cost center:", error);
    return errorResponse(
      res,
      error.status || 500,
      error.message || "Internal server error",
    );
  }
}

/**
 * GET ALL COST CENTERS
 */
export async function getCostCenters(req, res) {
  try {
    const { builder_id, company_id } = req.user;
    const costCenters = await costCenterService.getCostCenters(
      builder_id,
      company_id,
      req.query,
    );

    return successResponse(
      res,
      costCenters,
      "Cost centers retrieved successfully",
    );
  } catch (error) {
    console.error("Error getting cost centers:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

/**
 * GET COST CENTER BY ID
 */
export async function getCostCenterById(req, res) {
  try {
    const { builder_id, company_id } = req.user;
    const { cost_center_id } = req.params;

    const costCenter = await costCenterService.getCostCenterById(
      cost_center_id,
      builder_id,
      company_id,
    );

    res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Cost center retrieved successfully",
      data: costCenter,
    });
  } catch (error) {
    console.error("Error getting cost center:", error);
    res.status(500).json({
      success: false,
      statusCode: 500,
      message: error.message || "Internal server error",
      data: null,
    });
  }
}

/**
 * UPDATE COST CENTER
 */
export async function updateCostCenter(req, res) {
  try {
    const { builder_id, company_id, users_id } = req.user;
    const { cost_center_id } = req.params;

    const costCenter = await costCenterService.updateCostCenter(
      cost_center_id,
      req.body,
      builder_id,
      company_id,
      users_id,
    );

    res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Cost center updated successfully",
      data: costCenter,
    });
  } catch (error) {
    console.error("Error updating cost center:", error);
    res.status(error.status || 500).json({
      success: false,
      statusCode: error.status || 500,
      message: error.message || "Internal server error",
      data: null,
    });
  }
}

/**
 * DELETE COST CENTER
 */
export async function deleteCostCenter(req, res) {
  try {
    const { builder_id, company_id } = req.user;
    const { cost_center_id } = req.params;

    await costCenterService.deleteCostCenter(
      cost_center_id,
      builder_id,
      company_id,
    );

    res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Cost center deleted successfully",
      data: null,
    });
  } catch (error) {
    console.error("Error deleting cost center:", error);
    res.status(error.status || 500).json({
      success: false,
      statusCode: error.status || 500,
      message: error.message || "Internal server error",
      data: null,
    });
  }
}

/**
 * TOGGLE COST CENTER STATUS
 */
export async function toggleCostCenterStatus(req, res) {
  try {
    const { builder_id, company_id, users_id } = req.user;
    const { cost_center_id } = req.params;

    const costCenter = await costCenterService.toggleCostCenterStatus(
      cost_center_id,
      builder_id,
      company_id,
      users_id,
    );

    res.status(200).json({
      success: true,
      statusCode: 200,
      message: `Cost center status ${
        costCenter.status ? "activated" : "deactivated"
      } successfully`,
      data: costCenter,
    });
  } catch (error) {
    console.error("Error toggling cost center status:", error);
    res.status(500).json({
      success: false,
      statusCode: 500,
      message: error.message || "Internal server error",
      data: null,
    });
  }
}

/**
 * CREATE COST CENTER CHECKLIST MAP
 */
export async function createCostCenterChecklistMap(req, res) {
  try {
    const { builder_id, company_id } = req.user;

    const mapping = await costCenterService.createCostCenterChecklistMapService(
      req.body,
      builder_id,
      company_id,
    );

    return successResponse(
      res,
      mapping,
      "Cost center checklist mapping created successfully",
      201,
    );
  } catch (error) {
    console.error("Error creating cost center checklist mapping:", error);
    return errorResponse(
      res,
      error.status || 500,
      error.message || "Internal server error",
    );
  }
}

/**
 * GET ALL COST CENTER CHECKLIST MAPS
 */
export async function getCostCenterChecklistMaps(req, res) {
  try {
    const { builder_id, company_id } = req.user;

    const mappings = await costCenterService.getCostCenterChecklistMapsService(
      builder_id,
      company_id,
      req.query,
    );

    return successResponse(
      res,
      mappings,
      "Cost center checklist mappings retrieved successfully",
    );
  } catch (error) {
    console.error("Error getting cost center checklist mappings:", error);
    return errorResponse(
      res,
      error.status || 500,
      error.message || "Internal server error",
    );
  }
}

/**
 * DELETE COST CENTER CHECKLIST MAP
 */
export async function deleteCostCenterChecklistMap(req, res) {
  try {
    const { builder_id, company_id } = req.user;
    const { id } = req.params;

    await costCenterService.deleteCostCenterChecklistMapService(
      id,
      builder_id,
      company_id,
    );

    return successResponse(
      res,
      null,
      "Cost center checklist mapping deleted successfully",
    );
  } catch (error) {
    console.error("Error deleting cost center checklist mapping:", error);
    return errorResponse(
      res,
      error.status || 500,
      error.message || "Internal server error",
    );
  }
}
