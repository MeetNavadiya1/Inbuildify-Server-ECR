import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import {
  getAllSurveyorService,
  updateSurveyorService,
  createSurveyorService,
  deleteSurveyorService,
} from "./surveyor.service.js"

export async function getAllSurveyor(req, res) {
  const builderId = req.user.builder_id;
  const { page = 1, limit = 25 } = req.query;

  try {
    const result = await getAllSurveyorService({
      builderId,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    });

    return successResponse(res, result, "Surveyors fetched successfully.");
  } catch (error) {
    console.error("Error fetching surveyors:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function updateSurveyor(req, res) {
  const { surveyor_id } = req.params;
  const builderId = req.user.builder_id;
  const companyId = req.user.company_id;

  try {
    if (!surveyor_id) {
      return errorResponse(res, 400, "Surveyor ID is required.");
    }

    const result = await updateSurveyorService({
      surveyorId: surveyor_id,
      builderId,
      companyId,
      payload: req.body,
    });

    return successResponse(res, result, "Surveyor updated successfully.");
  } catch (error) {
    console.error("Error updating surveyor:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function createSurveyor(req, res) {
  const builderId = req.user.builder_id;
  const companyId = req.user.company_id;

  try {
    if (!companyId) {
      return errorResponse(res, 400, "Company ID not found.");
    }

    const result = await createSurveyorService({
      builderId,
      companyId,
      payload: req.body,
    });

    return successResponse(res, result, "Surveyor created successfully.");
  } catch (error) {
    console.error("Error creating surveyor:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function deleteSurveyor(req, res) {
  const { surveyor_id } = req.params;
  const builderId = req.user.builder_id;

  try {
    if (!surveyor_id) {
      return errorResponse(res, 400, "Surveyor ID is required.");
    }

    await deleteSurveyorService({ surveyorId: surveyor_id, builderId });

    return successResponse(res, null, "Surveyor deleted successfully.");
  } catch (error) {
    console.error("Error deleting surveyor:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}
