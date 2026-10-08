import { errorResponse, successResponse } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  getUserJobCommissionSettingsService,
  updateJobCommissionSettingsService,
} from "./job-commission-setting.service.js";

/**
 * Updates job commission settings for the authenticated organization.
 */
export async function updateJobCommissionSettings(req, res) {
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

    const { define_outgoing_commission, define_incoming_commission } = req.body;

    if (define_outgoing_commission === undefined && define_incoming_commission === undefined) {
      return errorResponse(res, 400, "No fields provided to update.");
    }

    const result = await updateJobCommissionSettingsService(req.body, {
      builderId,
      companyId,
      userId,
    });

    return successResponse(
      res,
      keysToCamelCase(result),
      "Job commission settings updated successfully.",
    );
  } catch (error) {
    console.error("Error updating job commission settings:", error);
    const status = error.status || 500;
    const message = error.message || "Internal Server Error.";
    return errorResponse(res, status, message);
  }
}

/**
 * Fetches job commission settings for the authenticated organization.
 * Automatically creates settings if they don't exist.
 */
export async function getUserJobCommissionSettings(req, res) {
  try {
    const { company_id, builder_id, user_id, users_id } = req.user;
    const effectiveUserId = user_id || users_id;

    const result = await getUserJobCommissionSettingsService({
      companyId: company_id,
      builderId: builder_id,
      userId: effectiveUserId,
    });

    return successResponse(
      res,
      keysToCamelCase(result),
      "Job commission settings fetched successfully",
    );
  } catch (error) {
    console.error("Error fetching job commission settings:", error);
    const status = error.status || 500;
    const message = error.message || "Internal server error";
    return errorResponse(res, status, message);
  }
}
