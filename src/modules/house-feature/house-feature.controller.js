import { successResponse, errorResponse } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  createHouseFeatureService,
  getAllHouseFeaturesService,
  getHouseFeatureByIdService,
  updateHouseFeatureService,
  deleteHouseFeatureService,
} from "./house-feature.service.js";

export async function createHouseFeature(req, res) {
  try {
    const userId = req.user?.users_id;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!userId || !builderId) {
      return errorResponse(
        res,
        401,
        "Unauthorized: User or builder ID missing",
      );
    }

    const { name, description, company_id, builder_id } = req.body;

    const data = {
      name,
      description,
      company_id: company_id || companyId,
      builder_id: builder_id || builderId,
    };

    const newFeature = await createHouseFeatureService(data, userId);

    return successResponse(
      res,
      keysToCamelCase(newFeature.get({ plain: true })),
      "House feature created successfully",
    );
  } catch (error) {
    console.error("Create house feature error:", error);
    const statusCode = error.statusCode || 500;
    return errorResponse(res, statusCode, error.message || "Internal server error");
  }
}

export async function getAllHouseFeatures(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId) {
      return errorResponse(res, 401, "Unauthorized: Builder ID missing");
    }

    const result = await getAllHouseFeaturesService(req.query, companyId, builderId);

    return successResponse(
      res,
      {
        houseFeatures: result.rows.map((row) => keysToCamelCase(row.get({ plain: true }))),
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.count,
          totalPages: Math.ceil(result.count / result.limit),
        },
      },
      "House features retrieved successfully",
    );
  } catch (error) {
    console.error("Get all house features error:", error);
    const statusCode = error.statusCode || 500;
    return errorResponse(res, statusCode, error.message || "Internal server error");
  }
}

export async function getHouseFeatureById(req, res) {
  try {
    const { house_feature_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId) {
      return errorResponse(res, 401, "Unauthorized: Builder ID missing");
    }

    const feature = await getHouseFeatureByIdService(house_feature_id, companyId, builderId);

    return successResponse(
      res,
      keysToCamelCase(feature.get({ plain: true })),
      "House feature retrieved successfully",
    );
  } catch (error) {
    console.error("Get house feature by ID error:", error);
    const statusCode = error.statusCode || 500;
    return errorResponse(res, statusCode, error.message || "Internal server error");
  }
}

export async function updateHouseFeature(req, res) {
  try {
    const { house_feature_id } = req.params;
    const userId = req.user?.users_id;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!userId || !builderId) {
      return errorResponse(
        res,
        401,
        "Unauthorized: User or builder ID missing",
      );
    }

    const updatedFeature = await updateHouseFeatureService(
      house_feature_id,
      req.body,
      userId,
      companyId,
      builderId,
    );

    return successResponse(
      res,
      keysToCamelCase(updatedFeature.get({ plain: true })),
      "House feature updated successfully",
    );
  } catch (error) {
    console.error("Update house feature error:", error);
    const statusCode = error.statusCode || 500;
    return errorResponse(res, statusCode, error.message || "Internal server error");
  }
}

export async function deleteHouseFeature(req, res) {
  try {
    const { house_feature_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId) {
      return errorResponse(res, 401, "Unauthorized: Builder ID missing");
    }

    await deleteHouseFeatureService(house_feature_id, companyId, builderId);

    return successResponse(res, "House feature deleted successfully");
  } catch (error) {
    console.error("Delete house feature error:", error);
    const statusCode = error.statusCode || 500;
    return errorResponse(res, statusCode, error.message || "Internal server error");
  }
}
