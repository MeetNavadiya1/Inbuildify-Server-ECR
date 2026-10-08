import { successResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  createColorGroupItemMapService,
  getAllColorGroupItemMapsService,
  deleteColorGroupItemMapService,
} from "./color-group-item-map.service.js";

export async function createColorGroupItemMap(req, res) {
  try {
    const newMapping = await createColorGroupItemMapService(req.user, req.body);

    return successResponse(
      res,
      keysToCamelCase(newMapping),
      "Color group item mapping created successfully.",
    );
  } catch (error) {
    console.error("Create Color Group Item Map Error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function getAllColorGroupItemMaps(req, res) {
  try {
    const data = await getAllColorGroupItemMapsService(req.user, req.query);

    return successResponse(
      res,
      {
        mappings: keysToCamelCase(data.mappings),
        pagination: data.pagination,
      },
      "Color group item mappings retrieved successfully.",
    );
  } catch (error) {
    console.error("Get All Color Group Item Maps Error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function deleteColorGroupItemMap(req, res) {
  try {
    const { id } = req.params;
    await deleteColorGroupItemMapService(req.user, id);

    return successResponse(
      res,
      null,
      "Color group item mapping deleted successfully.",
    );
  } catch (error) {
    console.error("Delete Color Group Item Map Error:", error);
    // Not a bare errorResponse: the sample-data guard's refusal is a deliberate
    // 403 whose message is written for the user, and reporting it as a 500
    // turned a rule working as designed into what looked like a server fault.
    return handleControllerError(res, error, "Internal Server Error");
  }
}
