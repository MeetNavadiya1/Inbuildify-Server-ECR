import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import * as userGroupService from "./user-group.service.js";

export async function createUserGroup(req, res) {
  try {
    const response = await userGroupService.createUserGroup(req.user, req.body);
    return successResponse(res, response, "User group created successfully.");
  } catch (error) {
    console.error("Error creating user group:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function getAllUserGroups(req, res) {
  try {
    const response = await userGroupService.getAllUserGroups(req.user, req.query);
    return successResponse(res, response, "User groups fetched successfully.");
  } catch (error) {
    console.error("Error fetching user groups:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function updateUserGroup(req, res) {
  try {
    const response = await userGroupService.updateUserGroup(req.user, req.params.user_group_id, req.body);
    return successResponse(res, response, "User group updated successfully.");
  } catch (error) {
    console.error("Update user group error:", error);
    return handleControllerError(res, error, error.message || "Internal server error.");
  }
}

export async function updateUserGroupIsActive(req, res) {
  try {
    const response = await userGroupService.updateUserGroupIsActive(req.user, req.params.user_group_id);
    return successResponse(res, response, "User group status updated successfully.");
  } catch (error) {
    console.error("Error updating user_group is_active:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

