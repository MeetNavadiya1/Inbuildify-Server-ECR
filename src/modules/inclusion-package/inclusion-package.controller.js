import { successResponse, errorResponse } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  createInclusionPackageService,
  getAllInclusionPackagesService,
  getInclusionPackageByIdService,
  updateInclusionPackageService,
  deleteInclusionPackageService,
} from "./inclusion-package.service.js";

/**
 * Creates a new inclusion package.
 */
export async function createInclusionPackage(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.users_id || req.user?.user_id; // Added users_id for flexibility

    if (!builderId && !companyId) {
      return errorResponse(res, 401, "Unauthorized: Organization ID missing.");
    }

    const { name } = req.body;

    const result = await createInclusionPackageService({
      companyId,
      builderId,
      userId,
      name,
    });

    return successResponse(
      res,
      keysToCamelCase(result.get({ plain: true })),
      "Inclusion package created successfully.",
    );
  } catch (error) {
    console.error("Error creating inclusion package:", error);
    const statusCode = error.status || 500;
    const message = error.message || "Internal Server Error.";
    return errorResponse(res, statusCode, message);
  }
}

/**
 * Retrieves all inclusion packages for an organization.
 */
export async function getAllInclusionPackages(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId && !companyId) {
      return errorResponse(res, 401, "Unauthorized.");
    }

    const result = await getAllInclusionPackagesService(req.query, {
      builderId,
      companyId,
    });

    return successResponse(
      res,
      result.map((item) => keysToCamelCase(item.get({ plain: true }))),
      "Inclusion packages fetched successfully.",
    );
  } catch (error) {
    console.error("Error fetching inclusion packages:", error);
    const statusCode = error.status || 500;
    const message = error.message || "Internal Server Error.";
    return errorResponse(res, statusCode, message);
  }
}

/**
 * Retrieves a single inclusion package by ID.
 */
export async function getInclusionPackageById(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const { id } = req.params;

    const result = await getInclusionPackageByIdService(id, {
      builderId,
      companyId,
    });

    return successResponse(res, keysToCamelCase(result.get({ plain: true })));
  } catch (error) {
    console.error("Error fetching inclusion package:", error);
    const statusCode = error.status || 500;
    const message = error.message || "Internal Server Error.";
    return errorResponse(res, statusCode, message);
  }
}

/**
 * Updates an inclusion package.
 */
export async function updateInclusionPackage(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.users_id || req.user?.user_id;
    const { id } = req.params;
    const { name } = req.body;

    const result = await updateInclusionPackageService(
      id,
      name,
      { builderId, companyId },
      userId,
    );

    return successResponse(
      res,
      keysToCamelCase(result.get({ plain: true })),
      "Inclusion package updated successfully.",
    );
  } catch (error) {
    console.error("Error updating inclusion package:", error);
    const statusCode = error.status || 500;
    const message = error.message || "Internal Server Error.";
    return errorResponse(res, statusCode, message);
  }
}

/**
 * Deletes an inclusion package.
 */
export async function deleteInclusionPackage(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const { id } = req.params;

    await deleteInclusionPackageService(id, {
      builderId,
      companyId,
    });

    return successResponse(res, null, "Inclusion package deleted successfully.");
  } catch (error) {
    console.error("Error deleting inclusion package:", error);
    const statusCode = error.status || 500;
    const message = error.message || "Internal Server Error.";
    return errorResponse(res, statusCode, message);
  }
}
