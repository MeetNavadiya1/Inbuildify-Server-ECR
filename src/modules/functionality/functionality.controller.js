
import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  getFunctionalitiesService,
  getFunctionalitiesByScreenService,
  getFunctionalitiesByScreenWithoutPaginationService,
} from "./functionality.service.js";


export async function getFunctionalities(req, res) {
  try {
    const dataResult = await getFunctionalitiesService();

    return successResponse(
      res,
      keysToCamelCase(dataResult),
      "Functionalities fetched successfully.",
    );
  } catch (error) {
    console.error("Error fetching functionalities:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}
//NOT USED ANYWHERE
export async function getFunctionalitiesByScreen(req, res) {
  try {
    const builder_id = req.user.builder_id;
    const { screen_id, page = 1, limit = 25 } = req.query;

    if (!screen_id) {
      return errorResponse(res, 400, "screen_id is required");
    }

    const { functionalities, pagination } = await getFunctionalitiesByScreenService({
      screen_id,
      builder_id,
      page,
      limit,
    });

    return successResponse(
      res,
      {
        functionalities: keysToCamelCase(functionalities),
        pagination,
      },
      "Functionalities fetched successfully.",
    );
  } catch (error) {
    console.error("Error fetching functionalities:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function getFunctionalitiesByScreenWithoutPagination(req, res) {
  try {
    const { screenId } = req.params;

    if (!screenId) {
      return errorResponse(res, 400, "screenId is required");
    }

    const result = await getFunctionalitiesByScreenWithoutPaginationService({ screenId });

    return successResponse(
      res,
      keysToCamelCase(result),
      "Functionalities fetched successfully",
    );
  } catch (error) {
    console.error("Error fetching functionalities:", error);
    return handleControllerError(res, error,
      error.statusCode ? error.message : "Internal server error"
    );
  }
}
