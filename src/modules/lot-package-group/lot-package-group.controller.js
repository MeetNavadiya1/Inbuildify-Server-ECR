import { successResponse, errorResponse } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import lotPackageGroupService from "./lot-package-group.service.js";

/**
 * Create a new lot package group
 */
export async function createLotPackageGroup(req, res) {
  try {
    const data = await lotPackageGroupService.createLotPackageGroupService(req.body, req.user);
    return successResponse(
      res,
      keysToCamelCase(data),
      "Lot package group created successfully",
    );
  } catch (error) {
    console.error("Create lot package group error:", error);
    return errorResponse(
      res,
      error.status || 500,
      error.message || "Internal server error",
    );
  }
}

/**
 * Get all lot package groups
 */
export async function getAllLotPackageGroups(req, res) {
  try {
    const { page = 1, limit = 25, search } = req.query;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    const { groups, totalCount } = await lotPackageGroupService.getAllLotPackageGroupsService({
      builderId,
      companyId,
      page: parseInt(page),
      limit: parseInt(limit),
      search,
    });

    return successResponse(
      res,
      {
        groups,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      },
      "Lot package groups retrieved successfully",
    );
  } catch (error) {
    console.error("Get all lot package groups error:", error);
    return errorResponse(
      res,
      error.status || 500,
      error.message || "Internal server error",
    );
  }
}

/**
 * Get a lot package group by ID
 */
export async function getLotPackageGroupById(req, res) {
  try {
    const { lot_package_group_id } = req.params;
    const data = await lotPackageGroupService.getLotPackageGroupByIdService(lot_package_group_id, req.user);

    return successResponse(
      res,
      keysToCamelCase(data),
      "Lot package group retrieved successfully",
    );
  } catch (error) {
    console.error("Get lot package group by ID error:", error);
    return errorResponse(
      res,
      error.status || 500,
      error.message || "Internal server error",
    );
  }
}

/**
 * Update a lot package group
 */
export async function updateLotPackageGroup(req, res) {
  try {
    const { lot_package_group_id } = req.params;
    const data = await lotPackageGroupService.updateLotPackageGroupService(lot_package_group_id, req.body, req.user);

    return successResponse(
      res,
      keysToCamelCase(data),
      "Lot package group updated successfully",
    );
  } catch (error) {
    console.error("Update lot package group error:", error);
    return errorResponse(
      res,
      error.status || 500,
      error.message || "Internal server error",
    );
  }
}

/**
 * Delete a lot package group
 */
export async function deleteLotPackageGroup(req, res) {
  try {
    const { lot_package_group_id } = req.params;
    await lotPackageGroupService.deleteLotPackageGroupService(lot_package_group_id, req.user);

    return successResponse(res, {}, "Lot package group deleted successfully");
  } catch (error) {
    console.error("Delete lot package group error:", error);
    return errorResponse(
      res,
      error.status || 500,
      error.message || "Internal server error",
    );
  }
}

export default {
  createLotPackageGroup,
  getAllLotPackageGroups,
  getLotPackageGroupById,
  updateLotPackageGroup,
  deleteLotPackageGroup,
};
