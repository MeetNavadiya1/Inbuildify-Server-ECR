import { errorResponse, successResponse, handleControllerError } from "../../helper/response.js";
import jobVariationItemService from "./job-variation-item.service.js";

export async function addJobVariationItem(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId && !companyId) {
      return errorResponse(res, 401, "Unauthorized");
    }

    const result = await jobVariationItemService.addJobVariationItem(
      req.body,
      builderId,
      companyId
    );

    if (result.success) {
      return successResponse(res, result.data, 201, result.message);
    }
    return errorResponse(res, 400, result.message);
  } catch (error) {
    console.error("Add job variation item error:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function addExtraJobVariationItem(req, res) {
  try {
    const { variation_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId && !companyId) {
      return errorResponse(res, 401, "Unauthorized");
    }

    const result = await jobVariationItemService.addExtraJobVariationItemService(
      variation_id,
      req.body,
      builderId,
      companyId
    );

    if (result.success) {
      return successResponse(res, result.data, 201, result.message);
    }
    return errorResponse(res, 400, result.message);
  } catch (error) {
    console.error("Add extra job variation item error:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function updateJobVariationItem(req, res) {
  try {
    const { id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    const result = await jobVariationItemService.updateJobVariationItem(
      id,
      req.body,
      builderId,
      companyId
    );

    if (result.success) {
      return successResponse(res, result.data, 200, result.message);
    }
    return errorResponse(res, 400, result.message);
  } catch (error) {
    console.error("Update job variation item error:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function updateExtraJobVariationItem(req, res) {
  try {
    const { id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    const result = await jobVariationItemService.updateExtraJobVariationItemService(
      id,
      req.body,
      builderId,
      companyId
    );

    if (result.success) {
      return successResponse(res, result.data, 200, result.message);
    }
    return errorResponse(res, 400, result.message);
  } catch (error) {
    console.error("Update extra job variation item error:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function getJobVariationItems(req, res) {
  try {
    const { variation_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    const result = await jobVariationItemService.getJobVariationItems(
      variation_id,
      builderId,
      companyId
    );

    if (result.success) {
      return successResponse(res, result.data, 200, result.message);
    }
    return errorResponse(res, 400, result.message);
  } catch (error) {
    console.error("Get job variation items error:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function getJobVariationItemById(req, res) {
  try {
    const { id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    const result = await jobVariationItemService.getJobVariationItemById(
      id,
      builderId,
      companyId
    );

    if (result.success) {
      return successResponse(res, result.data, 200, result.message);
    }
    return errorResponse(res, 400, result.message);
  } catch (error) {
    console.error("Get job variation item by id error:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function deleteJobVariationItem(req, res) {
  try {
    const { id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    const result = await jobVariationItemService.deleteJobVariationItem(
      id,
      builderId,
      companyId
    );

    if (result.success) {
      return successResponse(res, null, 200, result.message);
    }
    return errorResponse(res, 400, result.message);
  } catch (error) {
    console.error("Delete job variation item error:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export default {
  addJobVariationItem,
  addExtraJobVariationItem,
  updateJobVariationItem,
  updateExtraJobVariationItem,
  getJobVariationItems,
  getJobVariationItemById,
  deleteJobVariationItem,
};
