import { successResponse, errorResponse } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  getUserIntegrationSettingsService,
  updateIntegrationSettingsService,
} from "./integration-setting.service.js";

/**
 * Updates integration settings for the authenticated builder/company.
 */
export async function updateIntegrationSettings(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.users_id || req.user?.user_id;

    if (!builderId && !companyId) {
      return errorResponse(
        res,
        401,
        "Unauthorized: Missing builder or company ID.",
      );
    }

    const result = await updateIntegrationSettingsService(req.body, {
      builderId,
      companyId,
      userId,
    });

    return successResponse(
      res,
      keysToCamelCase(result),
      "Integration settings updated successfully.",
    );
  } catch (error) {
    console.error("Error updating integration settings:", error);
    const status = error.status || 500;
    const message = error.message || "Internal Server Error.";
    return errorResponse(res, status, message);
  }
}

/**
 * Fetches integration settings for the authenticated user's organization.
 * Automatically creates a default setting if none exists (parity with legacy SQL).
 */
export async function getUserIntegrationSettings(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.users_id || req.user?.user_id;

    const result = await getUserIntegrationSettingsService({
      builderId,
      companyId,
      userId,
    });

    return successResponse(
      res,
      keysToCamelCase(result),
      "Integration settings fetched successfully",
    );
  } catch (error) {
    console.error("Error fetching integration settings:", error);
    const status = error.status || 500;
    const message = error.message || "Internal server error";
    return errorResponse(res, status, message);
  }
}
