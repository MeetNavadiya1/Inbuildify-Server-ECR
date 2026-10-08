import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import { getBestFacadesService } from "./admin-facade.service.js";

export async function getBestFacades(req, res) {
  try {
    const result = await getBestFacadesService();
    return successResponse(
      res,
      keysToCamelCase(result),
      "Best facades fetched successfully."
    );
  } catch (error) {
    return handleControllerError(res, error, "Internal Server Error");
  }
}
