
import { errorResponse, successResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  createConstructionTypeService,
  getAllConstructionTypesService,
  updateConstructionTypeService,
  deleteConstructionTypeService,
} from "./construction-type.service.js";

export async function createConstructionType(req, res) {
  const builderId = req.user?.builder_id;
  const companyId = req.user?.company_id;
  const userId = req.user?.user_id;

  const {
    builder,
    types_name,
    start_construction_days = 21,
    sort_order,
    dwelling_type = [],
  } = req.body;

  try {
    const result = await createConstructionTypeService({
      builderId,
      companyId,
      userId,
      builder,
      types_name,
      start_construction_days,
      sort_order,
      dwelling_type,
    });

    return successResponse(res, result, "Construction type created successfully.");
  } catch (error) {
    console.error("Create Construction Type Error:", error);
    return handleControllerError(res, error, error.message || "Internal server error.");
  }
}

export async function getAllConstructionTypes(req, res) {
  const loggedInBuilderId = req.user.builder_id;
  const { builder } = req.query;

  try {
    const result = await getAllConstructionTypesService({ loggedInBuilderId, builder });

    return successResponse(res, keysToCamelCase(result), "Construction types fetched successfully.");
  } catch (error) {
    console.error("Error fetching construction types:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function updateConstructionType(req, res) {
  const builderId = req.user?.builder_id;
  const companyId = req.user?.company_id;
  const userId = req.user?.user_id;
  const { construction_type_id } = req.params;
  const { types_name, start_construction_days, sort_order, dwelling_type } = req.body;

  try {
    if (!construction_type_id) {
      return errorResponse(res, 400, "construction_type_id is required.");
    }

    if (!types_name && start_construction_days === undefined && sort_order === undefined && dwelling_type === undefined) {
      return errorResponse(res, 400, "No fields provided for update.");
    }

    const result = await updateConstructionTypeService({
      builderId,
      companyId,
      userId,
      construction_type_id,
      types_name,
      start_construction_days,
      sort_order,
      dwelling_type,
    });

    return successResponse(res, keysToCamelCase(result), "Construction type updated successfully.");
  } catch (error) {
    console.error("Update Construction Type Error:", error);
    return handleControllerError(res, error, error.message || "Internal server error.");
  }
}

export async function deleteConstructionType(req, res) {
  const builderId = req.user?.builder_id;
  const userId = req.user?.user_id;
  const { construction_type_id } = req.params;

  try {
    await deleteConstructionTypeService({ builderId, userId, construction_type_id });

    return successResponse(res, {}, "Construction type deleted successfully.");
  } catch (error) {
    console.error("Error deleting construction type:", error);
    return handleControllerError(res, error, error.message || "Failed to delete construction type.");
  }
}
