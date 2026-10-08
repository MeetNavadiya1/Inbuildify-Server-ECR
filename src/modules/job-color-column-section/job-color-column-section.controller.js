
import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import {
  createJobColorColumnSectionService,
  getJobColorColumnSectionsService,
  deleteJobColorColumnSectionService,
  updateJobColorColumnSectionService,
} from "./Job-color-column-section.service.js";

// ─── Shared guard ─────────────────────────────────────────────────────────────

/** Returns true when both builder_id and company_id are absent from user context. */
function missingUserContext(builderId, companyId) {
  return !builderId && !companyId;
}

// ─── CREATE JOB COLOR COLUMN SECTION ─────────────────────────────────────────

export async function createJobColorColumnSection(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (missingUserContext(builderId, companyId)) {
      return errorResponse(res, 401, "Unauthorized: Builder or Company ID missing.");
    }

    const { section_name, sort_order } = req.body;
    const attachments = (req.body.image ?? req.body.attachments) || null;

    if (!section_name) {
      return errorResponse(res, 400, "Section name is required.");
    }

    const result = await createJobColorColumnSectionService({
      builderId,
      companyId,
      section_name,
      sort_order,
      attachments,
    });

    if (result.error) {
      return errorResponse(res, result.error.status, result.error.message);
    }

    return successResponse(
      res,
      result.data,
      "Job color column section created successfully.",
    );
  } catch (err) {
    console.error(err);
    return handleControllerError(res, err, err.message);
  }
}

// ─── GET JOB COLOR COLUMN SECTIONS ───────────────────────────────────────────

export async function getJobColorColumnSections(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (missingUserContext(builderId, companyId)) {
      return errorResponse(res, 401, "Unauthorized: Builder or Company ID missing.");
    }

    const { page, limit } = req.query;

    const result = await getJobColorColumnSectionsService({
      builderId,
      companyId,
      page,
      limit,
    });

    if (result.error) {
      return errorResponse(res, result.error.status, result.error.message);
    }

    return successResponse(res, result.data);
  } catch (err) {
    console.error(err);
    return handleControllerError(res, err, err.message || "Internal Server Error.");
  }
}

// ─── DELETE JOB COLOR COLUMN SECTION ─────────────────────────────────────────

export async function deleteJobColorColumnSection(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const { job_color_column_section_id } = req.params;

    if (!job_color_column_section_id) {
      return errorResponse(res, 400, "Section ID is required.");
    }

    if (missingUserContext(builderId, companyId)) {
      return errorResponse(res, 401, "Unauthorized: Builder or Company ID missing.");
    }

    const result = await deleteJobColorColumnSectionService({
      builderId,
      companyId,
      job_color_column_section_id,
    });

    if (result.error) {
      return errorResponse(res, result.error.status, result.error.message);
    }

    return successResponse(
      res,
      null,
      "Job color column section deleted successfully.",
    );
  } catch (err) {
    console.error(err);
    return handleControllerError(res, err, err.message || "Internal Server Error.");
  }
}

// ─── UPDATE JOB COLOR COLUMN SECTION ─────────────────────────────────────────

export async function updateJobColorColumnSection(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const { job_color_column_section_id } = req.params;

    if (!job_color_column_section_id) {
      return errorResponse(res, 400, "Section ID is required.");
    }

    if (missingUserContext(builderId, companyId)) {
      return errorResponse(res, 401, "Unauthorized: Builder or Company ID missing.");
    }

    const { section_name, sort_order } = req.body;
    const attachments = req.body.image ?? req.body.attachments;

    const result = await updateJobColorColumnSectionService({
      builderId,
      companyId,
      job_color_column_section_id,
      section_name,
      sort_order,
      attachments,
    });

    if (result.error) {
      return errorResponse(res, result.error.status, result.error.message);
    }

    return successResponse(
      res,
      result.data,
      "Job color column section updated successfully.",
    );
  } catch (err) {
    console.error(err);
    return handleControllerError(res, err, err.message || "Internal Server Error.");
  }
}
