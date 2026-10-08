import * as rolePermissionService from "./role-permission.service.js";
import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";

export async function createRolePermission(req, res) {
  try {
    const result = await rolePermissionService.createRolePermission(req.user, req.body);
    return successResponse(res, result, "Role permission created successfully.");
  } catch (error) {
    console.error("Create Role Permission Error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error.");
  }
}

export async function getAllRolePermission(req, res) {
  try {
    const result = await rolePermissionService.getAllRolePermission(req.user, req.query);
    return successResponse(res, result, "Role permission fetched successfully.");
  } catch (error) {
    console.error("Error fetching role permission:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function deleteRolePermission(req, res) {
  try {
    const { id } = req.params;
    if (!id) {
      return errorResponse(res, 400, "Role permission iD is required.");
    }
    await rolePermissionService.deleteRolePermission(req.user, id);
    return successResponse(res, null, "Role permission deleted successfully.");
  } catch (error) {
    console.error("Error deleting role permission:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function updateRolePermission(req, res) {
  try {
    const { role_permission_id } = req.params;
    if (!role_permission_id) {
      return errorResponse(res, 400, "role_permission_id is required.");
    }

    const result = await rolePermissionService.updateRolePermission(req.user, role_permission_id, req.body);
    return successResponse(res, result, "Role permission updated successfully.");
  } catch (error) {
    console.error("Error updating role permission:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error.");
  }
}

export async function updateRolePermissionIsActive(req, res) {
  try {
    const { role_permission_id } = req.params;
    const { is_active } = req.body;

    if (!role_permission_id) {
      return errorResponse(res, 400, "Role permission id is required");
    }

    const result = await rolePermissionService.updateRolePermissionIsActive(req.user, role_permission_id, is_active);
    return successResponse(res, result, "role status updated successfully.");
  } catch (error) {
    console.error("Error updating role is_active:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}
