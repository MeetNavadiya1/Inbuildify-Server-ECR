import { successResponse, errorResponse } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  createJobCommissionSubStageService,
  getAllJobCommissionSubStagesService,
  getJobCommissionSubStagesByCommissionIdService,
  updateJobCommissionSubStageService,
  deleteJobCommissionSubStageService,
} from "./job-commission-sub-stage.service.js";

/**
 * Creates a new job commission sub stage.
 */
export async function createJobCommissionSubStage(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const userId = req.user?.users_id || req.user?.user_id;

    const result = await createJobCommissionSubStageService(req.body, {
      builderId,
      userId,
    });

    return successResponse(
      res,
      keysToCamelCase(result),
      "Job commission sub stage created successfully.",
    );
  } catch (error) {
    console.error("Error creating job commission sub stage:", error);
    const status = error.status || 500;
    const message = error.message || "Internal server error.";
    return errorResponse(res, status, message);
  }
}

/**
 * Retrieves all job commission sub stages with pagination and builder scoping.
 */
export async function getAllJobCommissionSubStages(req, res) {
  try {
    const builderId = req.user?.builder_id;

    const result = await getAllJobCommissionSubStagesService(req.query, {
      builderId,
    });

    return successResponse(
      res,
      keysToCamelCase(result),
      "Job commission sub stages fetched successfully.",
    );
  } catch (error) {
    console.error("Error fetching job commission sub stages:", error);
    const status = error.status || 500;
    const message = error.message || "Internal server error.";
    return errorResponse(res, status, message);
  }
}

/**
 * Retrieves sub stages for a specific job commission ID with pagination.
 */
export async function getJobCommissionSubStagesByCommissionId(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const { job_commission_id } = req.params;

    const result = await getJobCommissionSubStagesByCommissionIdService(job_commission_id, req.query, {
      builderId,
    });

    return successResponse(
      res,
      keysToCamelCase(result),
      "Job commission sub stages fetched successfully.",
    );
  } catch (error) {
    console.error("Error fetching job commission sub stages by commission ID:", error);
    const status = error.status || 500;
    const message = error.message || "Internal server error.";
    return errorResponse(res, status, message);
  }
}

/**
 * Updates an existing job commission sub stage.
 */
export async function updateJobCommissionSubStage(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const userId = req.user?.users_id || req.user?.user_id;
    const { job_commission_sub_stage_id } = req.params;

    const result = await updateJobCommissionSubStageService(job_commission_sub_stage_id, req.body, {
      builderId,
      userId,
    });

    return successResponse(
      res,
      keysToCamelCase(result),
      "Job commission sub stage updated successfully.",
    );
  } catch (error) {
    console.error("Error updating job commission sub stage:", error);
    const status = error.status || 500;
    const message = error.message || "Internal server error.";
    return errorResponse(res, status, message);
  }
}

/**
 * Deletes a job commission sub stage.
 */
export async function deleteJobCommissionSubStage(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const { id } = req.params;

    const result = await deleteJobCommissionSubStageService(id, {
      builderId,
    });

    return successResponse(
      res,
      result, // data is null as per parity
      "Job commission sub stage deleted successfully.",
    );
  } catch (error) {
    console.error("Error deleting job commission sub stage:", error);
    const status = error.status || 500;
    const message = error.message || "Internal server error.";
    return errorResponse(res, status, message);
  }
}
