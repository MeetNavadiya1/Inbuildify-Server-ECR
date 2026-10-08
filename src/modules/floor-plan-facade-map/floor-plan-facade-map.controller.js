import floorPlanFacadeMapService from "./floor-plan-facade-map.service.js";
import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";

/* ---------------------------
   CREATE FLOOR PLAN FACADE MAP
---------------------------- */
export async function createFloorPlanFacadeMap(req, res) {
  try {
    const data = await floorPlanFacadeMapService.createFloorPlanFacadeMap(
      req.user,
      req.body,
    );

    return successResponse(
      res,
      data,
      "Floor plan facade mapping created successfully",
    );
  } catch (error) {
    console.error("Error in createFloorPlanFacadeMap:", error);
    return errorResponse(
      res,
      error.status || 500,
      error.message || "Internal server error",
    );
  }
}

/* ---------------------------
   GET ALL FLOOR PLAN FACADE MAPS
---------------------------- */
export async function getFloorPlanFacadeMaps(req, res) {
  try {
    const data = await floorPlanFacadeMapService.getFloorPlanFacadeMaps(
      req.user,
      req.query,
    );

    return successResponse(
      res,
      data,
      "Floor plan facade mappings retrieved successfully",
    );
  } catch (error) {
    console.error("Error in getFloorPlanFacadeMaps:", error);
    return errorResponse(
      res,
      error.status || 500,
      error.message || "Internal server error",
    );
  }
}

/* ---------------------------
   DELETE FLOOR PLAN FACADE MAP
---------------------------- */
export async function deleteFloorPlanFacadeMap(req, res) {
  try {
    const { id } = req.params;

    await floorPlanFacadeMapService.deleteFloorPlanFacadeMap(req.user, id);

    return successResponse(
      res,
      null,
      "Floor plan facade mapping deleted successfully",
    );
  } catch (error) {
    console.error("Error in deleteFloorPlanFacadeMap:", error);
    // See color-group-item-map.controller: a sample-data refusal is a 403 that
    // already carries the message the user should read.
    return handleControllerError(res, error, "Internal server error");
  }
}

export default {
  createFloorPlanFacadeMap,
  getFloorPlanFacadeMaps,
  deleteFloorPlanFacadeMap,
};
