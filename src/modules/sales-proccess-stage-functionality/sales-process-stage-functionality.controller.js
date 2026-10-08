import { successResponse, errorResponse } from "../../helper/response.js";
import { getSalesProcessStageFunctionalitiesService } from "./sales-process-stage-functionality.service.js";

/**
 * Controller to fetch all sales process stage functionalities
 */
export async function getSalesProcessStageFunctionalities(req, res) {
  try {
    const result = await getSalesProcessStageFunctionalitiesService();

    return successResponse(
      res,
      result,
      "Sales process stage functionalities retrieved successfully.",
    );
  } catch (error) {
    console.error("Error fetching sales process stage functionalities:", error);
    const statusCode = error.statusCode || 500;
    return errorResponse(res, statusCode, error.message || "Internal Server Error");
  }
}


