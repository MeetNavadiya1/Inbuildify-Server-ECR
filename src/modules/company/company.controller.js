import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import {
  upsertCompanyService,
  getCompanyService }
  from "./company.service.js";

export async function getCompany(req, res) {
  const builderId = req.user?.builder_id || null;
  const companyId = req.user?.company_id || null;

  try {
    if (!builderId && !companyId) {
      return errorResponse(res, 401, "Unauthorized");
    }

    const company = await getCompanyService({ builderId, companyId });

    return successResponse(res, company, "Company fetched successfully");
  } catch (err) {
    console.error("Error fetching company:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function upsertCompany(req, res) {
  const builderId = req.user?.builder_id || null;
  const companyId = req.user?.company_id || null;

  try {
    if (!builderId && !companyId) {
      return errorResponse(res, 401, "Unauthorized");
    }

    const company = await upsertCompanyService({ builderId, companyId }, req.body);

    return successResponse(res, company, "Company saved successfully");
  } catch (err) {
    console.error("Error upserting company:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}
