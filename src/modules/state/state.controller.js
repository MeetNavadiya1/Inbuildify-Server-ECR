import { errorResponse, successResponse, handleControllerError } from "../../helper/response.js";
import {
  getAllStatesService,
  getStatesByCountryIdService,
} from "./state.service.js";

export async function getState(req, res) {
  try {
    const { country_id } = req.params;

    const result = await getStatesByCountryIdService(country_id);

    if (result.error) {
      return errorResponse(res, result.status, result.error);
    }

    return successResponse(res, result, "State fetched successfully.");
  } catch (error) {
    console.error("Get State error:", error);
    return handleControllerError(res, error, error.message);
  }
}

export async function getAllStates(req, res) {
  try {
    const states = await getAllStatesService();

    return successResponse(res, states, "All states fetched successfully.");
  } catch (error) {
    console.error("Get All States error:", error);
    return handleControllerError(res, error, error.message);
  }
}
