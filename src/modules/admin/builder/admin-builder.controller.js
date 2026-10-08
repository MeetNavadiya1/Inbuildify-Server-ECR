import { successResponse, errorResponse } from "../../../helper/response.js";
import { listBuildersService, getBuilderService } from "./admin-builder.service.js";

const fail = (res, error, label) => {
  console.error(`${label} Error:`, error);
  return errorResponse(res, error.status || error.statusCode || 500, error.message || "Internal Server Error.");
};

export async function listBuilders(req, res) {
  try {
    const data = await listBuildersService({ query: req.query });
    return successResponse(res, data, "Builders fetched successfully.");
  } catch (error) {
    return fail(res, error, "List Builders");
  }
}

export async function getBuilder(req, res) {
  try {
    const data = await getBuilderService({ companyId: req.params.company_id });
    return successResponse(res, data, "Builder fetched successfully.");
  } catch (error) {
    return fail(res, error, "Get Builder");
  }
}

export default { listBuilders, getBuilder };
