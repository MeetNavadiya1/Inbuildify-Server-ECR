import { errorResponse, successResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import { getSalesModuleSettingService, updateSalesModuleSettingsService } from "./sales-module-setting.service.js";

export async function updateSalesModuleSettings(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const userId = req.user?.user_id;

    const result = await updateSalesModuleSettingsService({
      builderId,
      userId,
      payload: req.body,
    });

    return successResponse(
      res,
      keysToCamelCase(result.toJSON()),
      "Sales module settings updated successfully.",
    );
  } catch (error) {
    console.error("Error updating sales module settings:", error);
    return handleControllerError(res, error,
      error.message || "Internal Server Error",
    );
  }
}

export async function getSalesModuleSetting(req, res) {
  try {
    const { company_id, builder_id, user_id } = req.user;

    if (!company_id || !builder_id) {
      return errorResponse(res, 401, "Unauthorized.");
    }

    const settings = await getSalesModuleSettingService({
      company_id,
      builder_id,
      user_id,
    });

    return successResponse(
      res,
      { salesModuleSettings: keysToCamelCase(settings.toJSON()) },
      "Sales Module Settings fetched successfully",
    );
  } catch (error) {
    console.error("Error fetching sales module settings:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

