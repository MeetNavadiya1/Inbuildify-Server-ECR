
import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  createGeneralSettingService,
  updateGeneralSettingsService,
  getUserGeneralSettingsService,
} from "./general-setting.service.js";

export async function createGeneralSetting(req, res) {
  const builderId = req.user?.builder_id;
  const companyId = req.user?.company_id;

  try {
    if (!builderId) {
      return errorResponse(res, 400, "Builder ID not found in user context.");
    }

    if (!companyId) {
      return errorResponse(res, 400, "Company ID not found.");
    }

    const result = await createGeneralSettingService({
      ...req.body,
      builderId,
      companyId,
    });

    return successResponse(res, result, "General settings created successfully.");
  } catch (err) {
    console.error("Error creating general settings:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function updateGeneralSettings(req, res) {
  const builderId = req.user?.builder_id;
  const companyId = req.user?.company_id;

  try {
    if (!companyId) {
      return errorResponse(res, 400, "Company ID not found.");
    }

    const result = await updateGeneralSettingsService({
      ...req.body,
      builderId,
      companyId,
    });

    return successResponse(res, result, "General setting updated successfully.");
  } catch (err) {
    console.error("Error updating general setting:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function getUserGeneralSettings(req, res) {
  const { company_id, builder_id } = req.user;
  try {
    const result = await getUserGeneralSettingsService({ company_id, builder_id });
    return successResponse(res, result, "General settings fetched");
  } catch (err) {
    console.error("Error fetching general settings:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}
