import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  getAllLocationService,
  createLocationService,
  updateLocationService,
  deleteLocationService,
} from "./location.service.js";

/**
 * Create location
 */
export async function createLocation(req, res) {
  try {
    const result = await createLocationService(req.body, req.user);
    return successResponse(
      res,
      keysToCamelCase(result.get({ plain: true })),
      "Location created successfully.",
    );
  } catch (err) {
    console.error("Error creating location:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

/**
 * Get all locations
 */
export async function getAllLocation(req, res) {
  try {
    const locations = await getAllLocationService(req.user, req.query);
    return successResponse(
      res,
      keysToCamelCase(locations.map((l) => l.get({ plain: true }))),
      "Locations retrieved successfully.",
    );
  } catch (err) {
    console.error("Error fetching locations:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

/**
 * Delete location
 */
export async function deleteLocation(req, res) {
  try {
    const { location_id } = req.params;
    await deleteLocationService(location_id, req.user);
    return successResponse(res, null, "Location deleted successfully.");
  } catch (err) {
    console.error("Error deleting location:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

/**
 * Update location
 */
export async function updateLocation(req, res) {
  try {
    const { location_id } = req.params;
    const result = await updateLocationService(location_id, req.body, req.user);
    return successResponse(
      res,
      keysToCamelCase(result.get({ plain: true })),
      "Location updated successfully.",
    );
  } catch (err) {
    console.error("Error updating location:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export default {
  createLocation,
  getAllLocation,
  deleteLocation,
  updateLocation,
};
