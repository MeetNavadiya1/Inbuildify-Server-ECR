import jobFormService from "./job-form.service.js";
import { successResponse, errorResponse } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";

export async function createJobForm(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId) {
      return errorResponse(res, 401, "Unauthorized.");
    }

    const result = await jobFormService.createJobFormService(req.body, {
      builderId,
      companyId,
    });

    return successResponse(
      res,
      keysToCamelCase(result),
      "Job form created successfully",
    );
  } catch (error) {
    console.error("Create job form error:", error);
    const status = error.status || 500;
    const message = error.message || "Internal Server Error";
    return errorResponse(res, status, message);
  }
}

export async function getAllJobForms(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId && !companyId) {
      return errorResponse(res, 401, "Unauthorized: User must belong to either a builder or company");
    }

    const result = await jobFormService.getAllJobFormsService(req.query, {
      builderId,
      companyId,
    });

    return successResponse(
      res,
      {
        jobForms: keysToCamelCase(result.jobForms),
        pagination: result.pagination,
      },
      "Job forms retrieved successfully",
    );
  } catch (error) {
    console.error("Get all job forms error:", error);
    const status = error.status || 500;
    const message = error.message || "Internal Server Error";
    return errorResponse(res, status, message);
  }
}

export async function getJobFormById(req, res) {
  try {
    const { leads_id } = req.params;
    const data = await jobFormService.getJobFormById(req.user, leads_id);

    return successResponse(
      res,
      data,
      "Job form retrieved successfully",
    );
  } catch (error) {
    console.error("Get job form by ID error:", error);
    const status = error.status || 500;
    const message = error.message || "Internal Server Error";
    return errorResponse(res, status, message);
  }
}

export async function updateJobForm(req, res) {
  try {
    const { job_form_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId) {
      return errorResponse(res, 401, "Unauthorized.");
    }

    const result = await jobFormService.updateJobFormService(job_form_id, req.body, {
      builderId,
      companyId,
    });

    return successResponse(
      res,
      keysToCamelCase(result),
      "Job form updated successfully",
    );
  } catch (error) {
    console.error("Update job form error:", error);
    const status = error.status || 500;
    const message = error.message || "Internal Server Error";
    return errorResponse(res, status, message);
  }
}

export async function deleteJobForm(req, res) {
  try {
    const { job_form_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId) {
      return errorResponse(res, 401, "Unauthorized.");
    }

    const result = await jobFormService.deleteJobFormService(job_form_id, {
      builderId,
      companyId,
    });

    return successResponse(
      res,
      result, // returns null mapped to data appropriately
      "Job form deleted successfully"
    );
  } catch (error) {
    console.error("Delete job form error:", error);
    const status = error.status || 500;
    const message = error.message || "Internal Server Error";
    return errorResponse(res, status, message);
  }
}
