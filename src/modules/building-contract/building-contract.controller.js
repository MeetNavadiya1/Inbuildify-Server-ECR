import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import * as service from "./building-contract.service.js";

export async function getByJobId(req, res) {
  try {
    const { job_id } = req.params;
    const contract = await service.getBuildingContractByJobId(job_id);
    return successResponse(res, contract, contract ? "Building contract found" : "No contract yet");
  } catch (error) {
    console.error("building-contract getByJobId:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function saveContract(req, res) {
  try {
    const { job_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const uploadedBy = req.user?.users_id;

    if (!builderId) return errorResponse(res, 401, "Unauthorized: Builder ID missing");

    const contract = await service.upsertBuildingContract({
      jobId: job_id,
      builderId,
      companyId,
      uploadedBy,
      data: req.body,
    });

    return successResponse(res, contract, "Building contract saved successfully");
  } catch (error) {
    console.error("building-contract saveContract:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function previewPdf(req, res) {
  try {
    const { building_contract_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const uploadedBy = req.user?.users_id;

    if (!builderId) return errorResponse(res, 401, "Unauthorized: Builder ID missing");

    const { url } = await service.generateAndStorePdf(building_contract_id, {
      builderId,
      companyId,
      uploadedBy,
    });

    if (!url) return errorResponse(res, 500, "Failed to generate PDF URL");
    return successResponse(res, { url }, "PDF generated successfully");
  } catch (error) {
    console.error("building-contract previewPdf:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}
