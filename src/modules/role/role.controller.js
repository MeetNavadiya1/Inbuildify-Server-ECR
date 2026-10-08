/**
 * P4 — Role management controller.
 * Thin layer: parses req, calls service, formats response.
 */

import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import {
  listCompanyRoles,
  listAssignableRoles,
  createCustomRole,
  updateRole,
  deleteRole,
  getRolePermissions,
  getMyPermissions,
  upsertRolePermissions,
  getRoleActivityLog,
  getAllRoleActivities,
} from "./role.service.js";

// ─── GET /role ────────────────────────────────────────────────────────────────
export async function getAllRole(req, res) {
  try {
    const roles = await listCompanyRoles(req.user);
    return successResponse(res, { roles }, "Roles fetched successfully.");
  } catch (error) {
    console.error("getAllRole error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

// ─── GET /role/assignable ──────────────────────────────────────────────────────
// Reference list for user-assignment dropdowns; not ROLE_MANAGEMENT-gated.
export async function getAssignableRoles(req, res) {
  try {
    const roles = await listAssignableRoles(req.user);
    return successResponse(res, { roles }, "Assignable roles fetched successfully.");
  } catch (error) {
    console.error("getAssignableRoles error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

// ─── POST /role ───────────────────────────────────────────────────────────────
export async function createRole(req, res) {
  try {
    const role = await createCustomRole(req.user, req.body);
    return successResponse(res, role, "Role created successfully.");
  } catch (error) {
    console.error("createRole error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

// ─── PATCH /role/:id ──────────────────────────────────────────────────────────
export async function patchRole(req, res) {
  try {
    const { id } = req.params;
    if (!id) return errorResponse(res, 400, "Role id is required.");
    const role = await updateRole(req.user, id, req.body);
    return successResponse(res, role, "Role updated successfully.");
  } catch (error) {
    console.error("patchRole error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

// ─── DELETE /role/:id ─────────────────────────────────────────────────────────
export async function deleteRoleController(req, res) {
  try {
    const { id } = req.params;
    if (!id) return errorResponse(res, 400, "Role id is required.");
    await deleteRole(req.user, id);
    return successResponse(res, null, "Role deleted successfully.");
  } catch (error) {
    console.error("deleteRole error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

// ─── GET /role/my-permissions ─────────────────────────────────────────────────
export async function getMyPermissionsController(req, res) {
  try {
    const result = await getMyPermissions(req.user);
    return successResponse(res, result, "Your role permissions fetched successfully.");
  } catch (error) {
    console.error("getMyPermissions error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

// ─── GET /role/:id/permissions ────────────────────────────────────────────────
export async function getRolePermissionsController(req, res) {
  try {
    const { id } = req.params;
    if (!id) return errorResponse(res, 400, "Role id is required.");
    const result = await getRolePermissions(req.user, id);
    return successResponse(res, result, "Role permissions fetched successfully.");
  } catch (error) {
    console.error("getRolePermissions error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

// ─── PUT /role/:id/permissions ────────────────────────────────────────────────
export async function upsertRolePermissionsController(req, res) {
  try {
    const { id } = req.params;
    if (!id) return errorResponse(res, 400, "Role id is required.");
    const { permissions } = req.body;
    const result = await upsertRolePermissions(req.user, id, permissions);
    return successResponse(res, result, "Role permissions saved successfully.");
  } catch (error) {
    console.error("upsertRolePermissions error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

// ─── GET /role/:id/activities ──────────────────────────────────────────────────
export async function getRoleActivityLogController(req, res) {
  try {
    const { id } = req.params;
    if (!id) return errorResponse(res, 400, "Role id is required.");
    
    // Pass query params for pagination
    const filters = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20,
      search: req.query.search
    };

    const result = await getRoleActivityLog(req.user, id, filters);
    // Avoid double wrapping! Service already returns { success, data, message }
    return res.status(200).json(result);
  } catch (error) {
    console.error("getRoleActivityLog error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

// ─── GET /role/activities/all ─────────────────────────────────────────────────
export async function getAllRoleActivitiesController(req, res) {
  try {
    const filters = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20,
      search: req.query.search
    };

    const result = await getAllRoleActivities(req.user, filters);
    // getAllRoleActivities already returns { success, data, message }
    return res.status(200).json(result);
  } catch (error) {
    console.error("getAllRoleActivities error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}
