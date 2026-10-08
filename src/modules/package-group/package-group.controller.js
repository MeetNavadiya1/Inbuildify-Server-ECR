import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  getAllPackageGroupsService,
  createPackageGroupService,
  deletePackageGroupService,
  updatePackageGroupService,
} from "./package-group.service.js";

/**
 * Format Package Group for consistent API response
 */
const formatPackageGroupResponse = (pg) => ({
  packageGroupId: pg.package_group_id,
  companyId: pg.company_id,
  builderId: pg.builder_id,
  name: pg.name,
  noOfPackages: pg.no_of_packages,
  createdAt: pg.createdAt || pg.created_at,
  updatedAt: pg.updatedAt || pg.updated_at,
  // Seeded demo record — badged in the UI, and left out of the pickers on a
  // "create new" form (Settings → Sample Data clears it).
  isSampleData: pg.is_sample_data === true,
});

/**
 * Create a new package group
 */
export async function createPackageGroup(req, res) {
  try {
    const builderId = req.user.builder_id;
    const companyId = req.user.company_id;

    if (!builderId && !companyId) {
      return errorResponse(res, 401, "Unauthorized. Builder or Company required.");
    }

    const { name, no_of_packages } = req.body;
    if (!name || name.trim() === "") {
      return errorResponse(res, 400, "Package group name is required.");
    }

    const result = await createPackageGroupService({
      builder_id: builderId,
      company_id: companyId,
      name,
      no_of_packages,
    });

    return successResponse(
      res,
      formatPackageGroupResponse(result),
      "Package group created successfully",
    );
  } catch (error) {
    console.error("createPackageGroup error:", error);
    return handleControllerError(res, error, error.message);
  }
}

/**
 * Get all package groups
 */
export async function getAllPackageGroups(req, res) {
  try {
    const builderId = req.user.builder_id;
    const companyId = req.user.company_id;

    if (!builderId && !companyId) {
      return errorResponse(res, 401, "Unauthorized. Builder or Company required.");
    }

    const { page = 1, limit = 25 } = req.query;

    const result = await getAllPackageGroupsService({
      builder_id: builderId,
      company_id: companyId,
      page,
      limit,
    });

    const formattedPackageGroups = result.packageGroups.map((row) => {
      const pg = row.get({ plain: true });
      return formatPackageGroupResponse(pg);
    });

    return successResponse(
      res,
      {
        packageGroups: formattedPackageGroups,
        total: result.total,
        page: result.page,
        totalPages: result.totalPages,
        limit: result.limit,
      },
      "Package groups fetched successfully",
    );
  } catch (error) {
    console.error("getAllPackageGroups error:", error);
    return handleControllerError(res, error, error.message);
  }
}

/**
 * Delete a package group
 */
export async function deletePackageGroup(req, res) {
  try {
    const { package_group_id } = req.params;
    const builderId = req.user.builder_id;
    const companyId = req.user.company_id;

    if (!package_group_id) {
      return errorResponse(res, 400, "Package Group ID is required.");
    }

    await deletePackageGroupService({
      package_group_id,
      builder_id: builderId,
      company_id: companyId,
    });

    return successResponse(res, {}, "Package group deleted successfully.");
  } catch (error) {
    console.error("deletePackageGroup error:", error);
    return handleControllerError(res, error, error.message);
  }
}

/**
 * Update a package group
 */
export async function updatePackageGroup(req, res) {
  try {
    const { package_group_id } = req.params;
    const builderId = req.user.builder_id;
    const companyId = req.user.company_id;

    if (!package_group_id) {
      return errorResponse(res, 400, "Package Group ID is required.");
    }

    const result = await updatePackageGroupService({
      package_group_id,
      builder_id: builderId,
      company_id: companyId,
      payload: req.body,
    });

    return successResponse(
      res,
      formatPackageGroupResponse(result),
      "Package group updated successfully.",
    );
  } catch (error) {
    console.error("updatePackageGroup error:", error);
    return handleControllerError(res, error, error.message);
  }
}

export default {
  createPackageGroup,
  getAllPackageGroups,
  deletePackageGroup,
  updatePackageGroup,
};
