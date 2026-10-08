
import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  createConstructionOptionService,
  getAllConstructionOptionsService,
  updateConstructionOptionService,
  deleteConstructionOptionService,
} from "./construction-option.service.js"

export async function createConstructionOption(req, res) {
  const builderId = req.user?.builder_id;
  const companyId = req.user?.company_id;
  const userId = req.user?.user_id;
  const { option_name } = req.body;

  try {
    if (!builderId) {
      return errorResponse(res, 400, "Builder ID not found in user context.");
    }

    if (!companyId) {
      return errorResponse(res, 400, "Company ID not found.");
    }

    const result = await createConstructionOptionService({
      builderId,
      companyId,
      userId,
      option_name,
    });

    return successResponse(res, keysToCamelCase(result), "Construction option created successfully.");
  } catch (error) {
    console.error("Error creating construction option:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function getAllConstructionOptions(req, res) {
  const builderId = req.user?.builder_id;
  const companyId = req.user?.company_id;

  try {
    if (!builderId || !companyId) {
      return errorResponse(res, 400, "Invalid user context (company_id or builder_id missing).");
    }

    const result = await getAllConstructionOptionsService({ builderId, companyId });

    return successResponse(res, keysToCamelCase(result), "Construction options fetched successfully.");
  } catch (error) {
    console.error("Error fetching construction options:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function updateConstructionOption(req, res) {
  const { id } = req.params;
  const builderId = req.user?.builder_id;
  const companyId = req.user?.company_id;
  const userId = req.user?.user_id;
  const { option_name } = req.body;

  try {
    if (option_name === undefined) {
      return errorResponse(res, 400, "No fields provided to update.");
    }

    const result = await updateConstructionOptionService({
      id,
      builderId,
      companyId,
      userId,
      option_name,
    });

    return successResponse(res, keysToCamelCase(result), "Construction option updated successfully.");
  } catch (error) {
    console.error("Error updating construction option:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function deleteConstructionOption(req, res) {
  const { id } = req.params;
  const builderId = req.user?.builder_id;
  const companyId = req.user?.company_id;

  try {
    if (!id) {
      return errorResponse(res, 400, "construction_option_id is required");
    }

    if (!builderId || !companyId) {
      return errorResponse(res, 400, "Invalid user context (company_id or builder_id missing).");
    }

    await deleteConstructionOptionService({ id, builderId, companyId });

    return successResponse(res, null, "Construction option deleted successfully.");
  } catch (error) {
    console.error("Delete construction option error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}
