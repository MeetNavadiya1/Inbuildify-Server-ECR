import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import {
  createContractSectionService,
  updateContractSectionService,
  deleteContractSectionService,
  getAllContractSectionsService,
  getContractSectionByIdService,
} from "./contract-section.service.js";

export async function createContractSection(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.user_id;

    const contractSection = await createContractSectionService(
      req.body,
      { builderId, companyId, userId },
    );

    return successResponse(
      res,
      contractSection,
      "Contract section created successfully.",
    );
  } catch (err) {
    console.error("Error creating contract section:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function getAllContractSections(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId && !companyId) {
      return errorResponse(
        res,
        401,
        "Unauthorized: Missing builder or company ID.",
      );
    }

    const result = await getAllContractSectionsService(req.query, { builderId, companyId });

    return successResponse(res, result);
  } catch (err) {
    console.error("Error fetching contract sections:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function getContractSectionById(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const { contract_section_id } = req.params;

    const result = await getContractSectionByIdService(contract_section_id, { builderId, companyId });

    return successResponse(
      res,
      result,
      "Contract section retrieved successfully.",
    );
  } catch (err) {
    console.error("Error fetching contract section:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function updateContractSection(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.user_id;
    const { contract_section_id } = req.params;

    const contractSection = await updateContractSectionService(
      contract_section_id,
      req.body,
      { builderId, companyId, userId },
    );

    return successResponse(
      res,
      contractSection,
      "Contract section updated successfully.",
    );
  } catch (err) {
    console.error("Error updating contract section:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function deleteContractSection(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.user_id;
    const { contract_section_id } = req.params;

    const message = await deleteContractSectionService(
      contract_section_id,
      { builderId, companyId, userId },
    );

    return successResponse(res, {}, message);
  } catch (err) {
    console.error("Error deleting contract section:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}
