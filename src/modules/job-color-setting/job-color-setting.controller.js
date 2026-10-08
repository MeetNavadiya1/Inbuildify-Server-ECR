import { errorResponse, successResponse } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  getUserJobColorSettingsService,
  updateJobColorSettingService,
} from "./job-color-setting.service.js";

/**
 * Updates job color settings for the authenticated organization.
 */
export async function updateJobColorSetting(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.user_id || req.user?.users_id;

    if (!builderId && !companyId) {
      return errorResponse(
        res,
        401,
        "Unauthorized: Missing builder or company ID.",
      );
    }

    const {
      hide_color_item_images,
      hide_color_item_price,
      exit_color_code,
      page_orientation_portrait,
      header_text,
    } = req.body;

    if (
      hide_color_item_images === undefined &&
      hide_color_item_price === undefined &&
      exit_color_code === undefined &&
      page_orientation_portrait === undefined &&
      header_text === undefined
    ) {
      return errorResponse(res, 400, "No valid fields provided for update.");
    }

    const result = await updateJobColorSettingService(req.body, {
      builderId,
      companyId,
      userId,
    });

    return successResponse(
      res,
      result, // result is already mapped to specific fields and camelCase in service for parity
      "Job color settings updated successfully.",
    );
  } catch (error) {
    console.error("Error updating job color settings:", error);
    const status = error.status || 500;
    const message = error.message || "Internal Server Error";
    return errorResponse(res, status, message);
  }
}

/**
 * Fetches job color settings for the authenticated organization.
 * Automatically creates settings and default columns if they don't exist.
 */
export async function getUserJobColorSettings(req, res) {
  try {
    const { company_id, builder_id, users_id, user_id } = req.user;
    const effectiveUserId = user_id || users_id;

    const result = await getUserJobColorSettingsService({
      companyId: company_id,
      builderId: builder_id,
      userId: effectiveUserId,
    });

    return successResponse(
      res,
      keysToCamelCase(result),
      "Job color settings fetched successfully",
    );
  } catch (error) {
    console.error("Error fetching job color settings:", error);
    const status = error.status || 500;
    const message = error.message || "Internal server error";
    return errorResponse(res, status, message);
  }
}
