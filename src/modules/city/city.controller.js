import { successResponse, handleControllerError } from "../../helper/response.js";
import { getCitiesService } from "./city.service.js";

export async function getCities(req, res) {
  try {
    const result = await getCitiesService(req.query);

    return successResponse(res, result, "Cities fetched successfully.");
  } catch (error) {
    console.error("Get Cities error:", error);
    return handleControllerError(res, error, error.message);
  }
}
