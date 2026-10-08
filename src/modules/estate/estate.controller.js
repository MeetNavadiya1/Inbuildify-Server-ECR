import { errorResponse, successResponse, handleControllerError } from "../../helper/response.js";
import { deleteFromS3 } from "../../utils/s3Upload.js";
import {
  getAllEstatesService,
  createEstateService,
  deleteEstateService,
  updateEstateService,
} from "./estate.service.js";

export async function createEstate(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.user_id;

    const data = await createEstateService({
      builderId,
      companyId,
      userId,
      data: req.body,
    });

    return successResponse(
      res,
      data,
      "Estate created successfully.",
    );
  } catch (error) {
    console.error("Create estate error:", error);
    return handleControllerError(res, error,
      error.message || "Failed to create estate.",
    );
  }
}

export async function getAllEstates(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    const data = await getAllEstatesService({
      builderId,
      companyId,
      query: req.query,
    });

    return successResponse(res, data, "Success");
  } catch (error) {
    console.error("Get all estates error:", error);
    return handleControllerError(res, error, "Failed to fetch estates.");
  }
}

export async function deleteEstate(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const { estate_id } = req.params;

    if (!estate_id) {
      return errorResponse(res, 400, "estate_id is required.");
    }

    await deleteEstateService({
      estate_id,
      builderId,
      companyId,
    });

    return successResponse(res, {}, "Estate deleted successfully.");
  } catch (error) {
    console.error("Delete estate error:", error);
    return handleControllerError(res, error,
      error.message || "Failed to delete estate.",
    );
  }
}

export async function updateEstate(req, res) {
  try {
    const { estate_id } = req.params;
    const builderId = req.user?.builder_id;
    const userId = req.user?.user_id;

    if (!estate_id) {
      return errorResponse(res, 400, "estate_id is required.");
    }

    const result = await updateEstateService({
      estate_id,
      builderId,
      userId,
      payload: req.body,
      deleteFromS3,
    });

    return successResponse(
      res,
      result,
      "Estate updated successfully.",
    );
  } catch (error) {
    console.error("Update estate error:", error);
    return handleControllerError(res, error,
      error.message || "Failed to update estate.",
    );
  }
}
