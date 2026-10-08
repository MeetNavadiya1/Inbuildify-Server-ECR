import { errorResponse, successResponse, handleControllerError } from "../../helper/response.js";
import quotationVersionCustomSectionService from "./quotation-version-custom-section.service.js";

export async function createCustomSection(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId && !companyId) {
      return errorResponse(res, 401, "Unauthorized");
    }

    const { quotation_version_id, file_url, sort_order } = req.body;

    const result = await quotationVersionCustomSectionService.createCustomSection(
      { quotation_version_id, file_url, sort_order },
      builderId,
      companyId
    );

    return successResponse(res, result, 201, "Custom section created successfully");
  } catch (error) {
    console.error("Create custom section error:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function getCustomSectionsByVersionId(req, res) {
  try {
    const { quotation_version_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId && !companyId) {
      return errorResponse(res, 401, "Unauthorized");
    }

    const result = await quotationVersionCustomSectionService.getCustomSectionsByVersionId(
      quotation_version_id,
      builderId,
      companyId,
    );

    return successResponse(res, result, "Custom sections fetched successfully");
  } catch (error) {
    console.error("Get custom sections error:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function updateCustomSection(req, res) {
  try {
    const { custom_section_id } = req.params;
    const { file_url, sort_order } = req.body;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId && !companyId) {
      return errorResponse(res, 401, "Unauthorized");
    }

    const result = await quotationVersionCustomSectionService.updateCustomSection(
      custom_section_id,
      { file_url, sort_order },
      builderId,
      companyId
    );

    return successResponse(res, result, "Custom section updated successfully");
  } catch (error) {
    console.error("Update custom section error:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function deleteCustomSection(req, res) {
  try {
    const { custom_section_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId && !companyId) {
      return errorResponse(res, 401, "Unauthorized");
    }

    await quotationVersionCustomSectionService.deleteCustomSection(
      custom_section_id,
      builderId,
      companyId
    );

    return successResponse(res, null, "Custom section deleted successfully");
  } catch (error) {
    console.error("Delete custom section error:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export default {
  createCustomSection,
  getCustomSectionsByVersionId,
  updateCustomSection,
  deleteCustomSection,
};
