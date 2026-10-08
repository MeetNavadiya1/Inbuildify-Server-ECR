import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import {
  getRoleTypesService,
  getAllRoleTypesService,
} from "./role-type.service.js";

export async function getRoleTypes(req, res) {
  try {
    const { role, page, limit } = req.query;

    if (!role) {
      return errorResponse(res, 400, "role (role_id) is required");
    }

    const result = await getRoleTypesService(role, page, limit);

    if (result.error) {
      return errorResponse(res, result.error.status, result.error.message);
    }

    return successResponse(
      res,
      result.data,
      "Role types fetched successfully",
    );
  } catch (error) {
    console.error("Error fetching role types:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function getAllRoleTypes(req, res) {
  try {
    const { page, limit } = req.query;
    const result = await getAllRoleTypesService(page, limit);

    return successResponse(
      res,
      result.data,
      "Role types fetched successfully",
    );
  } catch (error) {
    console.error("Error fetching role types:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

