import * as userPasswordHistoryService from "./user-password-history.service.js";
import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";

export async function createUserPasswordHistory(req, res) {
  try {
    const result = await userPasswordHistoryService.createUserPasswordHistory(req.user, req.body);
    return successResponse(res, result, "User password history saved successfully.");
  } catch (error) {
    console.error("Error saving user password history:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function getUserPasswordHistory(req, res) {
  try {
    const result = await userPasswordHistoryService.getUserPasswordHistory(req.user, req.query);
    return res.json({
      status: true,
      message: "User password history fetched successfully",
      ...result
    });
  } catch (error) {
    console.error("Error getting password history:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function getUserPasswordHistoryById(req, res) {
  try {
    const { id } = req.params;
    const result = await userPasswordHistoryService.getUserPasswordHistoryById(req.user, id);
    return successResponse(res, result, "User password history fetched successfully.");
  } catch (error) {
    console.error("Error fetching user password history:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function deleteUserPasswordHistory(req, res) {
  try {
    const { id } = req.params;
    await userPasswordHistoryService.deleteUserPasswordHistory(req.user, id);
    return successResponse(res, null, "User password history deleted successfully.");
  } catch (error) {
    console.error("Error deleting user password history:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function deleteUserPasswordHistoryByUserId(req, res) {
  try {
    const { user_id } = req.params;
    const result = await userPasswordHistoryService.deleteUserPasswordHistoryByUserId(req.user, user_id);
    return successResponse(res, result, "User password history deleted successfully.");
  } catch (error) {
    console.error("Error deleting user password history:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}
