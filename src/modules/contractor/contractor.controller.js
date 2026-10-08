import contractorService from "./contractor.service.js";
import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";

export async function createContractor(req, res) {
  try {
    const builderId = req.user.builder_id;
    const contractor = await contractorService.createContractor(builderId, req.body);

    return successResponse(
      res,
      keysToCamelCase(contractor),
      "Contractor created successfully.",
    );
  } catch (error) {
    console.error("Create contractor error:", error);
    if (error.status === 409) {
       return errorResponse(res, 409, error.message);
    }
    return handleControllerError(res, error, error.message || "Failed to create contractor.");
  }
}

export async function getContractors(req, res) {
  try {
    const builderId = req.user.builder_id;
    const contractors = await contractorService.getContractors(builderId);

    return successResponse(
      res,
      keysToCamelCase(contractors),
      "Contractors fetched successfully.",
    );
  } catch (error) {
    console.error("Get contractors error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function getContractorById(req, res) {
  try {
    const { id } = req.params;
    const builderId = req.user.builder_id;
    const contractor = await contractorService.getContractorById(id, builderId);

    return successResponse(
      res,
      keysToCamelCase(contractor),
      "Contractor fetched successfully.",
    );
  } catch (error) {
    console.error("Get contractor by ID error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function updateContractor(req, res) {
  try {
    const { id } = req.params;
    const builderId = req.user.builder_id;
    const updatedContractor = await contractorService.updateContractor(id, builderId, req.body);

    return successResponse(
      res,
      keysToCamelCase(updatedContractor),
      "Contractor updated successfully.",
    );
  } catch (error) {
    console.error("Error updating contractor:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function deleteContractor(req, res) {
  try {
    const { id } = req.params;
    const builderId = req.user.builder_id;
    await contractorService.deleteContractor(id, builderId);

    return successResponse(res, {}, "Contractor deleted successfully.");
  } catch (error) {
    console.error("Error deleting contractor:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export default {
  createContractor,
  getContractors,
  getContractorById,
  updateContractor,
  deleteContractor,
};
