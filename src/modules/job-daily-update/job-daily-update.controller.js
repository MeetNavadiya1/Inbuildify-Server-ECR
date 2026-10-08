import jobDailyUpdateService from "./job-daily-update.service.js";
import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";

const uploadedFiles = (req) => (Array.isArray(req.files) ? req.files : []);

export async function createDailyUpdate(req, res) {
  try {
    const { job_id } = req.params;
    const result = await jobDailyUpdateService.createDailyUpdate(job_id, req.body, uploadedFiles(req), req.user);

    if (!result.success) {
      return errorResponse(res, result.statusCode || 400, result.message);
    }

    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("createDailyUpdate error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function getJobDailyUpdates(req, res) {
  try {
    const { job_id } = req.params;
    const result = await jobDailyUpdateService.getJobDailyUpdates(job_id, req.query, req.user);

    if (!result.success) {
      return errorResponse(res, result.statusCode || 400, result.message);
    }

    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("getJobDailyUpdates error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function updateDailyUpdate(req, res) {
  try {
    const { job_daily_update_id } = req.params;
    const result = await jobDailyUpdateService.updateDailyUpdate(
      job_daily_update_id,
      req.body,
      uploadedFiles(req),
      req.user,
    );

    if (!result.success) {
      return errorResponse(res, result.statusCode || 400, result.message);
    }

    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("updateDailyUpdate error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function deleteDailyUpdate(req, res) {
  try {
    const { job_daily_update_id } = req.params;
    const result = await jobDailyUpdateService.deleteDailyUpdate(job_daily_update_id, req.user);

    if (!result.success) {
      return errorResponse(res, result.statusCode || 400, result.message);
    }

    return successResponse(res, null, result.message);
  } catch (error) {
    console.error("deleteDailyUpdate error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function getMyDailyUpdates(req, res) {
  try {
    const result = await jobDailyUpdateService.getMyDailyUpdates(req.query, req.user);

    if (!result.success) {
      return errorResponse(res, result.statusCode || 400, result.message);
    }

    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("getMyDailyUpdates error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}
