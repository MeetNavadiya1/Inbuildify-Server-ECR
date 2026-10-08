import jobDelayService from "./job-delay.service.js";
import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";

export async function createJobDelay(req, res) {
  try {
    const { job_id } = req.params;
    const result = await jobDelayService.createJobDelay(job_id, req.body, req.user);

    if (!result.success) {
      return errorResponse(res, result.statusCode || 400, result.message);
    }

    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("createJobDelay error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function getJobDelays(req, res) {
  try {
    const { job_id } = req.params;
    const result = await jobDelayService.getJobDelays(job_id, req.query, req.user);

    if (!result.success) {
      return errorResponse(res, result.statusCode || 400, result.message);
    }

    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("getJobDelays error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function getJobDelayById(req, res) {
  try {
    const { job_delay_id } = req.params;
    const result = await jobDelayService.getJobDelayById(job_delay_id, req.user);

    if (!result.success) {
      return errorResponse(res, result.statusCode || 400, result.message);
    }

    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("getJobDelayById error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function updateJobDelay(req, res) {
  try {
    const { job_delay_id } = req.params;
    const result = await jobDelayService.updateJobDelay(job_delay_id, req.body, req.user);

    if (!result.success) {
      return errorResponse(res, result.statusCode || 400, result.message);
    }

    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("updateJobDelay error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function deleteJobDelay(req, res) {
  try {
    const { job_delay_id } = req.params;
    const result = await jobDelayService.deleteJobDelay(job_delay_id, req.user);

    if (!result.success) {
      return errorResponse(res, result.statusCode || 400, result.message);
    }

    return successResponse(res, null, result.message);
  } catch (error) {
    console.error("deleteJobDelay error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}
