import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import {
  getAllColorGroupsService,
  getColorGroupByIdService,
  createColorGroupService,
  updateColorGroupService,
  deleteColorGroupService,
} from "./color-group.service.js";

export async function createColorGroup(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.users_id;

    if (!builderId || !companyId) {
      return errorResponse(res, 401, "Unauthorized.");
    }

    const { name } = req.body;

    if (!name || name.trim() === "") {
      return errorResponse(res, 400, "Color group name is required.");
    }

    const createdColorGroup = await createColorGroupService({
      builderId,
      companyId,
      userId,
      name,
    });

    return successResponse(
      res,
      createdColorGroup,
      "Color group created successfully.",
    );
  } catch (error) {
    console.error("Create Color Group Error:", error);
    return handleControllerError(res, error,
      error.message || "Internal Server Error",
    );
  }
}

export async function getAllColorGroups(req, res) {
  const builderId = req.user.builder_id;
  const companyId = req.user.company_id;
  const { status, search } = req.query;

  try {
    if (status !== undefined && !["true", "false"].includes(status)) {
      return errorResponse(res, 400, "status must be true or false");
    }

    const rows = await getAllColorGroupsService({
      builderId,
      companyId,
      status,
      search,
    });

    return successResponse(res, rows, "Color groups fetched successfully.");
  } catch (error) {
    console.error("Error fetching color groups:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function getColorGroupById(req, res) {
  const builderId = req.user.builder_id;
  const companyId = req.user.company_id;
  const { colorGroupId } = req.params;

  try {
    if (!colorGroupId) {
      return errorResponse(res, 400, "Color group ID is required.");
    }

    const result = await getColorGroupByIdService({
      colorGroupId,
      companyId,
      builderId,
    });

    return successResponse(res, result, "Color group fetched successfully.");
  } catch (error) {
    console.error("Error fetching color group:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function updateColorGroup(req, res) {
  try {
    const builderId = req.user.builder_id;
    const companyId = req.user.company_id;
    const userId = req.user?.users_id;
    const { colorGroupId } = req.params;

    if (!colorGroupId) {
      return errorResponse(res, 400, "Color group ID is required.");
    }

    const { name, status } = req.body;

    const updatedColorGroup = await updateColorGroupService({
      colorGroupId,
      companyId,
      builderId,
      userId,
      name,
      status,
    });

    return successResponse(
      res,
      updatedColorGroup,
      "Color group updated successfully.",
    );
  } catch (error) {
    console.error("Update Color Group Error:", error);
    return handleControllerError(res, error,
      error.message || "Internal Server Error",
    );
  }
}

export async function deleteColorGroup(req, res) {
  try {
    const builderId = req.user.builder_id;
    const companyId = req.user.company_id;
    const { colorGroupId } = req.params;

    if (!colorGroupId) {
      return errorResponse(res, 400, "Color group ID is required.");
    }

    await deleteColorGroupService({ colorGroupId, companyId, builderId });

    return successResponse(res, null, "Color group deleted successfully.");
  } catch (error) {
    console.error("Delete Color Group Error:", error);
    return handleControllerError(res, error,
      error.message || "Internal Server Error",
    );
  }
}

