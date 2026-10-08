

import maintenanceAreaService from "./maintenance-area.service.js";
import { successResponse, errorResponse } from "../../helper/response.js";

/**
 * Controller to create a new maintenance area
 */
export async function createMaintenanceArea(req, res) {
  try {
    const result = await maintenanceAreaService.createMaintenanceArea(req.user, req.body);
    return successResponse(res, result, "Maintenance area created successfully.");
  } catch (error) {
    console.error("Error creating maintenance area:", error);
    const status = error.status || 500;
    const message = error.message || "Internal server error.";
    return errorResponse(res, status, message, error.message);
  }
}

/**
 * Controller to get all maintenance areas with pagination
 */
export async function getAllMaintenanceAreas(req, res) {
  try {
    const result = await maintenanceAreaService.getAllMaintenanceAreas(req.user, req.query);
    return successResponse(res, result, "Maintenance areas fetched successfully.");
  } catch (error) {
    console.error("Error fetching maintenance areas:", error);
    const status = error.status || 500;
    const message = error.message || "Internal server error.";
    return errorResponse(res, status, message, error.message);
  }
}

/**
 * Controller to update a maintenance area
 */
export async function updateMaintenanceArea(req, res) {
  try {
    const { maintenance_area_id } = req.params;
    const result = await maintenanceAreaService.updateMaintenanceArea(
      req.user,
      maintenance_area_id,
      req.body,
    );
    return successResponse(res, result, "Maintenance area updated successfully.");
  } catch (error) {
    console.error("Error updating maintenance area:", error);
    const status = error.status || 500;
    const message = error.message || "Internal server error.";
    return errorResponse(res, status, message, error.message);
  }
}

/**
 * Controller to delete a maintenance area
 */
export async function deleteMaintenanceArea(req, res) {
  try {
    const { maintenance_area_id } = req.params;
    await maintenanceAreaService.deleteMaintenanceArea(req.user, maintenance_area_id);
    return successResponse(res, null, "Maintenance area deleted successfully.");
  } catch (error) {
    console.error("Error deleting maintenance area:", error);
    const status = error.status || 500;
    const message = error.message || "Internal server error.";
    return errorResponse(res, status, message, error.message);
  }
}
