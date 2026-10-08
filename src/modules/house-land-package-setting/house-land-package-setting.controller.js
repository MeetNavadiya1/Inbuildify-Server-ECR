import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  getHouseLandPackageSettingsService,
  updateHouseLandPackageSettingService,
} from "./house-land-package-setting.service.js"

export async function getHouseLandPackageSettings(req, res) {
  const { company_id, builder_id, user_id } = req.user;

  try {
    if (!company_id || !builder_id) {
      return errorResponse(res, 401, "Unauthorized.");
    }

    const result = await getHouseLandPackageSettingsService({ company_id, builder_id, user_id });

    return successResponse(
      res,
      { houseLandPackageSettings: keysToCamelCase(result) },
      "House Land Package Settings fetched successfully",
    );
  } catch (error) {
    console.error("Error fetching house land package settings:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function updateHouseLandPackageSetting(req, res) {
  const builderId = req.user?.builder_id;
  const companyId = req.user?.company_id;
  const userId = req.user?.user_id;
  const { id } = req.params;
  const { include_facade_cost_in_total } = req.body;

  try {
    if (!builderId && !companyId) {
      return errorResponse(res, 401, "Unauthorized: Missing builder or company ID.");
    }

    if (include_facade_cost_in_total === undefined) {
      return errorResponse(res, 400, "include_facade_cost_in_total field is required.");
    }

    const result = await updateHouseLandPackageSettingService({
      id,
      builderId,
      userId,
      include_facade_cost_in_total,
    });

    return successResponse(res, keysToCamelCase(result), "House land package setting updated successfully.");
  } catch (error) {
    console.error("Error updating house land package settings:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}
