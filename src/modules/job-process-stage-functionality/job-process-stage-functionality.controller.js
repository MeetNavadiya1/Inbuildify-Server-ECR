import { errorResponse, successResponse } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import { getJobProcessStageFunctionalitiesService } from "./job-process-stage-functionality.service.js";

export async function getJobProcessStageFunctionalities(req, res) {
  try {
    const result = await getJobProcessStageFunctionalitiesService();

    return successResponse(
      res,
      keysToCamelCase(result),
      "Job process stage functionalities fetched successfully.",
    );
  } catch (error) {
    console.error("Error fetching job process stage functionalities:", error);
    return errorResponse(
      res,
      500,
      "Internal server error.",
      error.message,
    );
  }
}
