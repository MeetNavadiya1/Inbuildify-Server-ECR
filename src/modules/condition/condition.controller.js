import { successResponse, errorResponse } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import conditionService from "./condition.service.js";

/**
 * Controller to fetch all conditions.
 */
export async function getConditions(req, res) {
  try {
    const conditions = await conditionService.getConditionsService();
    
    return successResponse(
      res,
      keysToCamelCase(conditions),
      "Conditions fetched successfully.",
    );
  } catch (err) {
    console.error("Error fetching conditions:", err);
    return errorResponse(
      res, 
      err?.statusCode || 400, 
      err.message || "Internal Server Error"
    );
  }
}

export default {
  getConditions,
};
