import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  getEtsRechargeSettingsService,
  updateEtsRechargeSettingsService,
} from "./construction-ets-recharge.service.js";

export async function getConstructionEtsRechargeSettings(req, res) {
  try {
    const user = req.user;
    const settings = await getEtsRechargeSettingsService(user);

    return successResponse(
      res,
      keysToCamelCase(settings),
      "Construction ETS recharge settings fetched",
    );
  } catch (error) {
    console.error("Fetch Construction ETS Recharge Error:", error);
    return handleControllerError(res, error, error.message);
  }
}

export async function updateConstructionEtsRechargeSettings(req, res) {
  try {
    const user = req.user;
    const payload = req.body;

    const settings = await updateEtsRechargeSettingsService(user, payload);

    return successResponse(
      res,
      keysToCamelCase(settings),
      "Construction ETS recharge settings saved successfully",
    );
  } catch (error) {
    console.error("Update Construction ETS Recharge Error:", error);
    return handleControllerError(res, error, error.message);
  }
}
