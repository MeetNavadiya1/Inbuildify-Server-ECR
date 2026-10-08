import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import ColorTypeService from "./color-type.service.js";

/**
 * Creates a new color type.
 */
export async function createColorType(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.users_id;
    const { color_type_name } = req.body;

    if (!builderId || !companyId) {
      return errorResponse(res, 401, "Unauthorized.");
    }

    if (!color_type_name || color_type_name.trim() === "") {
      return errorResponse(res, 400, "Color type name is required.");
    }

    const transformedData = await ColorTypeService.createColorTypeService({
      builderId,
      companyId,
      colorTypeName: color_type_name,
      userId,
    });

    return successResponse(
      res,
      transformedData,
      "Color type created successfully.",
    );
  } catch (error) {
    console.error("Create Color Type Error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

/**
 * Fetches all color types.
 */
export async function getAllColorTypes(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId || !companyId) {
      return errorResponse(res, 401, "Unauthorized.");
    }

    const transformedData = await ColorTypeService.getAllColorTypesService({
      builderId,
      companyId,
    });

    return successResponse(
      res,
      transformedData,
      "Color types retrieved successfully.",
    );
  } catch (error) {
    console.error("Get All Color Types Error:", error);
    return handleControllerError(res, error, "Internal Server Error");
  }
}

/**
 * Fetches a single color type by ID.
 */
export async function getColorTypeById(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const { id } = req.params;

    if (!builderId || !companyId) {
      return errorResponse(res, 401, "Unauthorized.");
    }

    if (!id) {
      return errorResponse(res, 400, "Color type ID is required.");
    }

    const transformedData = await ColorTypeService.getColorTypeByIdService({
      builderId,
      companyId,
      id,
    });

    if (!transformedData) {
      return errorResponse(res, 404, "Color type not found.");
    }

    return successResponse(
      res,
      transformedData,
      "Color type retrieved successfully.",
    );
  } catch (error) {
    console.error("Get Color Type By ID Error:", error);
    return handleControllerError(res, error, "Internal Server Error");
  }
}

/**
 * Updates an existing color type.
 */
export async function updateColorType(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.users_id;
    const { id } = req.params;
    const { color_type_name } = req.body;

    if (!builderId || !companyId) {
      return errorResponse(res, 401, "Unauthorized.");
    }

    if (!id) {
      return errorResponse(res, 400, "Color type ID is required.");
    }

    const transformedData = await ColorTypeService.updateColorTypeService({
      builderId,
      companyId,
      id,
      colorTypeName: color_type_name,
      userId,
    });

    return successResponse(
      res,
      transformedData,
      "Color type updated successfully.",
    );
  } catch (error) {
    console.error("Update Color Type Error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

/**
 * Deletes a color type.
 */
export async function deleteColorType(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const { id } = req.params;

    if (!builderId || !companyId) {
      return errorResponse(res, 401, "Unauthorized.");
    }

    if (!id) {
      return errorResponse(res, 400, "Color type ID is required.");
    }

    await ColorTypeService.deleteColorTypeService({
      builderId,
      companyId,
      id,
    });

    return successResponse(
      res,
      null,
      "Color type deleted successfully.",
    );
  } catch (error) {
    console.error("Delete Color Type Error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}
