import { successResponse, errorResponse } from "../../../helper/response.js";
import { listContractorsService, listSuppliersService } from "./admin-directory.service.js";

const fail = (res, error, label) => {
  console.error(`${label} Error:`, error);
  return errorResponse(res, error.status || error.statusCode || 500, error.message || "Internal Server Error.");
};

export async function listContractors(req, res) {
  try {
    const data = await listContractorsService({ query: req.query });
    return successResponse(res, data, "Contractors fetched successfully.");
  } catch (error) {
    return fail(res, error, "List Contractors");
  }
}

export async function listSuppliers(req, res) {
  try {
    const data = await listSuppliersService({ query: req.query });
    return successResponse(res, data, "Suppliers fetched successfully.");
  } catch (error) {
    return fail(res, error, "List Suppliers");
  }
}

export default { listContractors, listSuppliers };
