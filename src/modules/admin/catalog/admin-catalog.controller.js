import { successResponse, errorResponse } from "../../../helper/response.js";
import { listFacadesService, listDwellingsService } from "./admin-catalog.service.js";

const fail = (res, error, label) => {
  console.error(`${label} Error:`, error);
  return errorResponse(res, error.status || error.statusCode || 500, error.message || "Internal Server Error.");
};

export async function listFacades(req, res) {
  try {
    const data = await listFacadesService({ query: req.query });
    return successResponse(res, data, "Facades fetched successfully.");
  } catch (error) {
    return fail(res, error, "List Facades");
  }
}

export async function listDwellings(req, res) {
  try {
    const data = await listDwellingsService({ query: req.query });
    return successResponse(res, data, "Dwellings fetched successfully.");
  } catch (error) {
    return fail(res, error, "List Dwellings");
  }
}

export default { listFacades, listDwellings };
