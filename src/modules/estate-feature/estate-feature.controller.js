import { successResponse, errorResponse } from "../../helper/response.js";
import estateFeatureService from "./estate-feature.service.js";

/**
 * CREATE ESTATE FEATURE
 */
export async function createEstateFeature(req, res) {
  try {
    const { estate_id, feature_name } = req.body;
    const builderId = req.user?.builder_id;

    const data = await estateFeatureService.createEstateFeatureService({
      builderId,
      data: { estate_id, feature_name },
    });

    return successResponse(
      res,
      data,
      "Estate feature created successfully.",
    );
  } catch (err) {
    console.error("Error creating estate feature:", err);
    return errorResponse(
      res,
      err.status || 500,
      err.message || "Internal server error",
    );
  }
}

/**
 * GET ALL ESTATE FEATURES
 */
export async function getAllEstateFeatures(req, res) {
  try {
    const builderId = req.user?.builder_id;

    const data = await estateFeatureService.getAllEstateFeaturesService({
      builderId,
      query: req.query,
    });

    return successResponse(
      res,
      data,
      "Estate features fetched successfully.",
    );
  } catch (err) {
    console.error("Error fetching estate features:", err);
    return errorResponse(
      res,
      err.status || 500,
      err.message || "Internal server error",
    );
  }
}

/**
 * GET ESTATE FEATURES BY ESTATE ID
 */
export async function getEstateFeaturesByEstateId(req, res) {
  try {
    const { estate_id } = req.params;
    const builderId = req.user?.builder_id;

    const data = await estateFeatureService.getEstateFeaturesByEstateIdService(
      estate_id,
      builderId,
    );

    return successResponse(
      res,
      data,
      "Estate features fetched successfully.",
    );
  } catch (err) {
    console.error("Error fetching estate features:", err);
    return errorResponse(
      res,
      err.status || 500,
      err.message || "Internal server error",
    );
  }
}

/**
 * DELETE ESTATE FEATURE
 */
export async function deleteEstateFeature(req, res) {
  try {
    const { estate_feature_id } = req.params;
    const builderId = req.user?.builder_id;

    await estateFeatureService.deleteEstateFeatureService(
      estate_feature_id,
      builderId,
    );

    return successResponse(res, null, "Estate feature deleted successfully.");
  } catch (err) {
    console.error("Delete estate feature error:", err);
    return errorResponse(
      res,
      err.status || 500,
      err.message || "Failed to delete estate feature.",
    );
  }
}

/**
 * UPDATE ESTATE FEATURE
 */
export async function updateEstateFeature(req, res) {
  try {
    const { estate_feature_id } = req.params;
    const { feature_name } = req.body;
    const builderId = req.user?.builder_id;

    const data = await estateFeatureService.updateEstateFeatureService({
      id: estate_feature_id,
      builderId,
      data: { feature_name },
    });

    return successResponse(
      res,
      data,
      "Estate feature updated successfully.",
    );
  } catch (err) {
    console.error("Error updating estate feature:", err);
    return errorResponse(
      res,
      err.status || 500,
      err.message || "Internal server error",
    );
  }
}
