import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import {
  createUserRoleMappingService,
  getAllUserRoleMappingService,
  updateUserRoleMappingService,

} from "./user-role-mapping.service.js"

export async function createUserRoleMapping(req, res) {
  const builderId = req.user?.builder_id;
  const companyId = req.user?.company_id;

  try {
    if (!builderId || !companyId) {
      return errorResponse(res, 401, "Unauthorized.");
    }

    const { role_type_id = null, user_id = null, role_id, assigned_by = null } = req.body || {};

    if (!role_id) {
      return errorResponse(res, 400, "role_id is required.");
    }

    const result = await createUserRoleMappingService({
      builderId,
      companyId,
      role_id,
      role_type_id,
      user_id,
      assigned_by,
    });

    return successResponse(res, result, "Role mapping created successfully.");
  } catch (error) {
    console.error("Create User Role Mapping Error:", error);

    if (error.status === 409 || error.code === "23505") {
      return errorResponse(res, 409, "This role mapping already exists.");
    }

    return handleControllerError(res, error, error.message || "Internal Server Error.");
  }
}

export async function getAllUserRoleMapping(req, res) {
  const builderId = req.user?.builder_id;
  const companyId = req.user?.company_id;

  try {
    if (!builderId || !companyId) {
      return errorResponse(res, 401, "Unauthorized.");
    }

    const { page = 1, limit = 25, assigned_by } = req.query;

    const result = await getAllUserRoleMappingService({
      builderId,
      page: parseInt(page),
      limit: parseInt(limit),
      assignedBy: assigned_by,
    });

    return successResponse(res, result, "User role mapping fetched successfully.");
  } catch (error) {
    console.error("Get User Role Mapping Error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error.");
  }
}

export async function updateUserRoleMapping(req, res) {
  const { user_role_mapping_id } = req.params;
  const builderId = req.user?.builder_id;
  const companyId = req.user?.company_id;

  try {
    if (!builderId || !companyId) {
      return errorResponse(res, 401, "Unauthorized.");
    }

    const result = await updateUserRoleMappingService({
      userRoleMappingId: user_role_mapping_id,
      builderId,
      companyId,
      payload: req.body || {},
    });

    return successResponse(res, result, "User role mapping updated successfully.");
  } catch (error) {
    console.error("Update User Role Mapping Error:", error);

    if (error.status === 409 || error.code === "23505") {
      return errorResponse(res, 409, "This role mapping already exists.");
    }

    return handleControllerError(res, error, error.message || "Internal Server Error.");
  }
}
