import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import contractFormatService from "./contract-format.service.js";
import { keysToCamelCase } from "../../utils/common.js";

export async function createContractFormat(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.user_id;

    const contractFormat = await contractFormatService.createContractFormat(
      req.body,
      { builderId, companyId, userId },
    );

    return successResponse(
      res,
      contractFormat,
      "Contract format created successfully.",
    );
  } catch (err) {
    console.error("Error creating contract format:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function getAllContractFormats(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    const result = await contractFormatService.getAllContractFormatsService(
      req.query,
      { builderId, companyId },
    );

    return successResponse(res, result);
  } catch (err) {
    console.error("Error fetching contract formats:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function getContractFormatById(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const { contract_format_id } = req.params;

    const result = await contractFormatService.getContractFormatByIdService(
      contract_format_id,
      { builderId, companyId },
    );

    return successResponse(
      res,
      result,
      "Contract format retrieved successfully.",
    );
  } catch (err) {
    console.error("Error fetching contract format:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function updateContractFormat(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.user_id;
    const { contract_format_id } = req.params;

    const contractFormat = await contractFormatService.updateContractFormatService(
      contract_format_id,
      req.body,
      { builderId, companyId, userId },
    );

    return successResponse(
      res,
      contractFormat,
      "Contract format updated successfully.",
    );
  } catch (err) {
    console.error("Error updating contract format:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function deleteContractFormat(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const { contract_format_id } = req.params;

    const result = await contractFormatService.deleteContractFormatService(
      contract_format_id,
      { builderId, companyId },
    );

    return successResponse(res, result);
  } catch (err) {
    console.error("Error deleting contract format:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}
