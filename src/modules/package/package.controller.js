import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  getAllPackagesService,
  createPackageService,
  updatePackageService,
  deletePackageService,
} from "./package.service.js";

export async function createPackage(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.user_id;

    if (!builderId || !companyId) {
      return errorResponse(res, 401, "Unauthorized.");
    }

    const formattedPackage = await createPackageService({
      builder_id: builderId,
      company_id: companyId,
      user_id: userId,
      payload: req.body,
    });

    return successResponse(
      res,
      formattedPackage,
      "Package created successfully.",
    );
  } catch (error) {
    console.error("Create Package Error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error.");
  }
}

export async function getAllPackages(req, res) {
  try {
    const builderId = req.user.builder_id;

    const result = await getAllPackagesService({
      builder_id: builderId,
      query: req.query,
    });

    return successResponse(
      res,
      {
        package: result.packages,
        pagination: {
          totalRecords: result.totalRecords,
          currentPage: result.currentPage,
          totalPages: result.totalPages,
          limit: result.limit,
        },
      },
      "Packages fetched successfully.",
    );
  } catch (error) {
    console.error("getAllPackages error:", error);
    return handleControllerError(res, error, error.message);
  }
}

export async function deletePackage(req, res) {
  try {
    const { package_id } = req.params;
    const builderId = req.user.builder_id;
    const companyId = req.user.company_id;

    await deletePackageService({
      package_id,
      builder_id: builderId,
      company_id: companyId,
    });

    return successResponse(res, null, "Package deleted successfully.");
  } catch (err) {
    console.error("Error deleting package:", err);
    return handleControllerError(res, err,
      err.message || "Internal Server Error",
    );
  }
}

export async function updatePackage(req, res) {
  try {
    const builderId = req.user.builder_id;
    const companyId = req.user.company_id;
    const userId = req.user.user_id;
    const { package_id } = req.params;

    if (!package_id) {
      return errorResponse(res, 400, "package_id is required.");
    }

    const formattedPackage = await updatePackageService({
      package_id,
      builder_id: builderId,
      company_id: companyId,
      user_id: userId,
      payload: req.body,
    });

    return successResponse(
      res,
      formattedPackage,
      "Package updated successfully",
    );
  } catch (error) {
    console.error("updatePackage error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}
