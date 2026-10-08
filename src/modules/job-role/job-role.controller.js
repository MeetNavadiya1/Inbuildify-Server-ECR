import jobRoleService from "./job-role.service.js";
import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";

// GET /job-role/:job_id — roles + eligible users + current assignment.
export async function getJobRoles(req, res) {
  try {
    const { job_id } = req.params;
    const result = await jobRoleService.getJobRoles(job_id, req.query, req.user);
    if (!result.success) return errorResponse(res, result.statusCode || 400, result.message);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("getJobRoles error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

// GET /job-role/:job_id/assigned — flat list of the filled roles only.
export async function getAssignedJobRoles(req, res) {
  try {
    const { job_id } = req.params;
    const result = await jobRoleService.getAssignedUsers(job_id, req.user);
    if (!result.success) return errorResponse(res, result.statusCode || 400, result.message);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("getAssignedJobRoles error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

// PUT /job-role/:job_id — bulk save from the Assign Roles modal.
export async function saveJobRoles(req, res) {
  try {
    const { job_id } = req.params;
    const result = await jobRoleService.saveJobRoles(job_id, req.body.assignments, req.user);
    if (!result.success) return errorResponse(res, result.statusCode || 400, result.message);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("saveJobRoles error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

// POST /job-role/:job_id/:role_id — assign or reassign one role.
export async function assignJobRole(req, res) {
  try {
    const { job_id, role_id } = req.params;
    const result = await jobRoleService.assignJobRole(job_id, role_id, req.body.user_id, req.user);
    if (!result.success) return errorResponse(res, result.statusCode || 400, result.message);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("assignJobRole error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

// DELETE /job-role/:job_id/:role_id — clear one role.
export async function unassignJobRole(req, res) {
  try {
    const { job_id, role_id } = req.params;
    const result = await jobRoleService.unassignJobRole(job_id, role_id, req.user);
    if (!result.success) return errorResponse(res, result.statusCode || 400, result.message);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("unassignJobRole error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export default {
  getJobRoles,
  getAssignedJobRoles,
  saveJobRoles,
  assignJobRole,
  unassignJobRole,
};
