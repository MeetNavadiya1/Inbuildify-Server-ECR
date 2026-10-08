import { successResponse, errorResponse } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  updateSchedulerSettingsService,
  getSchedulerSettingsService,
} from "./scheduler-setting.service.js";

export async function updateSchedulerSettings(req, res) {
  try {
    const result = await updateSchedulerSettingsService(req.user, req.body);

    return successResponse(
      res,
      keysToCamelCase(result),
      "Scheduler settings updated successfully.",
    );
  } catch (error) {
    console.error("Error updating scheduler settings:", error);
    const statusCode = error.statusCode || 500;
    return errorResponse(res, statusCode, error.message || "Internal server error.");
  }
}


export async function getSchedulerSettings(req, res) {
  try {
    const result = await getSchedulerSettingsService(req.user);

    return successResponse(
      res,
      keysToCamelCase(result),
      "Scheduler settings fetched successfully.",
    );
  } catch (error) {
    console.error("Error fetching scheduler settings:", error);
    const statusCode = error.statusCode || 500;
    return errorResponse(res, statusCode, error.message || "Internal Server Error");
  }
}


