import { successResponse, errorResponse } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import lotPackageService from "./lot-package.service.js";

/**
 * Create a new lot package
 */
export async function createLotPackage(req, res) {
  try {
    const data = await lotPackageService.createLotPackageService(req.body, req.user);
    return successResponse(
      res,
      keysToCamelCase(data),
      "Lot package created successfully",
    );
  } catch (error) {
    console.error("Create lot package error:", error);
    return errorResponse(
      res,
      error.status || 500,
      error.message || "Internal server error",
    );
  }
}

/**
 * Get all lot packages
 */
export async function getAllLotPackages(req, res) {
  try {
    const result = await lotPackageService.getAllLotPackagesService(req.query, req.user);
    return successResponse(
      res,
      result,
      "Lot packages retrieved successfully",
    );
  } catch (error) {
    console.error("Get all lot packages error:", error);
    return errorResponse(
      res,
      error.status || 500,
      error.message || "Internal server error",
    );
  }
}

/**
 * Get a lot package by ID
 */
export async function getLotPackageById(req, res) {
  try {
    const { lot_package_id } = req.params;
    const data = await lotPackageService.getLotPackageByIdService(lot_package_id, req.user);
    return successResponse(
      res,
      keysToCamelCase(data),
      "Lot package retrieved successfully",
    );
  } catch (error) {
    console.error("Get lot package by ID error:", error);
    return errorResponse(
      res,
      error.status || 500,
      error.message || "Internal server error",
    );
  }
}

/**
 * Update a lot package
 */
export async function updateLotPackage(req, res) {
  try {
    const { lot_package_id } = req.params;
    const data = await lotPackageService.updateLotPackageService(lot_package_id, req.body, req.user);
    return successResponse(
      res,
      keysToCamelCase(data),
      "Lot package updated successfully",
    );
  } catch (error) {
    console.error("Update lot package error:", error);
    return errorResponse(
      res,
      error.status || 500,
      error.message || "Internal server error",
    );
  }
}

/**
 * Delete a lot package
 */
export async function deleteLotPackage(req, res) {
  try {
    const { lot_package_id } = req.params;
    await lotPackageService.deleteLotPackageService(lot_package_id, req.user);
    return successResponse(res, {}, "Lot package deleted successfully");
  } catch (error) {
    console.error("Delete lot package error:", error);
    return errorResponse(
      res,
      error.status || 500,
      error.message || "Internal server error",
    );
  }
}

export default {
  createLotPackage,
  getAllLotPackages,
  getLotPackageById,
  updateLotPackage,
  deleteLotPackage,
};
