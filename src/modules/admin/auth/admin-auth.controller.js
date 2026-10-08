import { successResponse, errorResponse } from "../../../helper/response.js";
import { adminLoginService, adminProfileService } from "./admin-auth.service.js";

export async function adminLogin(req, res) {
  try {
    const data = await adminLoginService(req.body);
    return successResponse(res, data, "Logged in successfully.");
  } catch (error) {
    console.error("Admin Login Error:", error);
    return errorResponse(res, error.status || 500, error.message || "Internal Server Error.");
  }
}

export async function adminMe(req, res) {
  try {
    const data = await adminProfileService({ platformUserId: req.admin.platform_user_id });
    return successResponse(res, data, "Admin profile fetched successfully.");
  } catch (error) {
    console.error("Admin Profile Error:", error);
    return errorResponse(res, error.status || 500, error.message || "Internal Server Error.");
  }
}

export async function adminLogout(req, res) {
  return successResponse(res, null, "Logged out successfully.");
}

export default { adminLogin, adminMe, adminLogout };
