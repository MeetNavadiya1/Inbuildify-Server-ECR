import countryService from "./country.service.js";
import { errorResponse, successResponse } from "../../helper/response.js";

/**
 * GET /country - Fetch the supported countries
 */
export async function getCountries(req, res) {
  try {
    const data = await countryService.getCountries();
    return successResponse(res, data, "Countries fetched successfully.");
  } catch (error) {
    console.error("CountryController.getCountries error:", error);
    return errorResponse(res, error?.status || 500, error?.message || "Internal Server Error");
  }
}
