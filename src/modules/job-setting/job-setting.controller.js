
import { errorResponse, successResponse } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  createJobSettingsService,
  updateJobSettingsService,
  getUserJobSettingsService,
} from "./job-settings.service.js";

/**
 * Controller to create job settings.
 */
export async function createJobSettings(req, res) {
  try {
    const result = await createJobSettingsService(req.body, req.user);

    return successResponse(
      res,
      keysToCamelCase(result),
      "Job settings created successfully.",
    );
  } catch (err) {
    console.error("Error creating job settings:", err);
    return errorResponse(
      res,
      err.status || 500,
      err.message || "Internal Server Error",
    );
  }
}

/**
 * Controller to update job settings.
 */
export async function updateJobSettings(req, res) {
  try {
    const result = await updateJobSettingsService(req.body, req.user);

    return successResponse(
      res,
      keysToCamelCase(result),
      "Job settings updated successfully.",
    );
  } catch (err) {
    console.error("Error updating job settings:", err);
    return errorResponse(
      res,
      err.status || 500,
      err.message || "Internal Server Error",
    );
  }
}

/**
 * Controller to fetch job settings for a user.
 */
export async function getUserJobSettings(req, res) {
  try {
    const result = await getUserJobSettingsService(req.user);

    return successResponse(
      res,
      keysToCamelCase(result),
      "Job settings fetched successfully.",
    );
  } catch (err) {
    console.error("Error fetching job settings:", err);
    return errorResponse(
      res,
      err.status || 500,
      err.message || "Internal Server Error",
    );
  }
}
