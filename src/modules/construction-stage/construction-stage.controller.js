
import { errorResponse, successResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  createConstructionStageService,
  getAllConstructionStagesService,
  updateConstructionStageService,
  deleteConstructionStageService,
  reorderStagesService,
  initializeJobStagesService,
  getJobStagesService,
  updateJobStageStatusService,
} from "./construction-stage.service.js";

export async function createConstructionStage(req, res) {
  const builderId = req.user?.builder_id;
  const companyId = req.user?.company_id;
  const userId = req.user?.user_id;

  const {
    builder,
    construction_type_id,
    workflow_type = "CONSTRUCTION",
    stage_name,
    days = 10,
    sort_order,
    site_image = false,
    inspection = "not_required",
    bg_color,
    font_color,
    icon = null,
    status = "active",
  } = req.body;

  try {
    const result = await createConstructionStageService({
      builderId,
      companyId,
      userId,
      builder,
      construction_type_id,
      workflow_type,
      stage_name,
      days,
      sort_order,
      site_image,
      inspection,
      bg_color,
      font_color,
      icon,
      status,
    });

    return successResponse(res, keysToCamelCase(result), "Construction stage created successfully.");
  } catch (error) {
    console.error("Create Construction Stage Error:", error);
    return handleControllerError(res, error, error.message || "Internal server error.");
  }
}

export async function getAllConstructionStages(req, res) {
  const loggedInBuilderId = req.user.builder_id;
  const { builder, construction_type_id, workflow_type } = req.query;

  try {
    const result = await getAllConstructionStagesService({
      loggedInBuilderId,
      builder,
      construction_type_id,
      workflow_type,
    });

    return successResponse(res, keysToCamelCase(result), "Construction stages fetched successfully.");
  } catch (error) {
    console.error("Error fetching construction stages:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function updateConstructionStage(req, res) {
  const builderId = req.user?.builder_id;
  const companyId = req.user?.company_id;
  const userId = req.user?.user_id;
  const { construction_stage } = req.params;

  const {
    stage_name,
    workflow_type,
    days,
    sort_order,
    site_image,
    inspection,
    bg_color,
    font_color,
    icon,
    status,
  } = req.body;

  try {
    if (!builderId) {
      return errorResponse(res, 403, "Unauthorized. Builder login required.");
    }

    if (!construction_stage) {
      return errorResponse(res, 400, "Construction stage ID is required.");
    }

    const result = await updateConstructionStageService({
      builderId,
      companyId,
      userId,
      construction_stage,
      stage_name,
      workflow_type,
      days,
      sort_order,
      site_image,
      inspection,
      bg_color,
      font_color,
      icon,
      status,
    });

    return successResponse(res, keysToCamelCase(result), "Construction stage updated successfully.");
  } catch (error) {
    console.error("Update Construction Stage Error:", error);
    return handleControllerError(res, error, error.message || "Internal server error.");
  }
}

export async function deleteConstructionStage(req, res) {
  const builderId = req.user?.builder_id;
  const { construction_stage } = req.params;

  try {
    if (!builderId) {
      return errorResponse(res, 403, "Unauthorized. Builder login required.");
    }

    if (!construction_stage) {
      return errorResponse(res, 400, "Construction stage ID is required.");
    }

    await deleteConstructionStageService({ builderId, construction_stage });

    return successResponse(res, {}, "Construction stage deleted successfully.");
  } catch (error) {
    console.error("Error deleting construction stage:", error);
    return handleControllerError(res, error, error.message || "Failed to delete construction stage.");
  }
}

// ── Reorder catalog stages ────────────────────────────────────────────────────
export async function reorderConstructionStages(req, res) {
  const builderId = req.user?.builder_id;
  const userId = req.user?.user_id;
  const { items } = req.body;

  try {
    if (!builderId) {
      return errorResponse(res, 403, "Unauthorized. Builder login required.");
    }

    const result = await reorderStagesService({ builderId, userId, items });
    return successResponse(res, keysToCamelCase(result), "Construction stages reordered successfully.");
  } catch (error) {
    console.error("Reorder Construction Stages Error:", error);
    return handleControllerError(res, error, error.message || "Internal server error.");
  }
}

// ── Initialize a job's stage progress from the catalog ────────────────────────
export async function initializeJobStages(req, res) {
  const builderId = req.user?.builder_id;
  const companyId = req.user?.company_id;
  const userId = req.user?.user_id;
  const { jobId } = req.params;
  const { workflow_type = "CONSTRUCTION" } = req.body || {};

  try {
    if (!builderId) {
      return errorResponse(res, 403, "Unauthorized. Builder login required.");
    }

    const result = await initializeJobStagesService({
      jobId,
      builderId,
      companyId,
      userId,
      workflow_type,
    });

    return successResponse(res, keysToCamelCase(result), "Job stages initialized successfully.");
  } catch (error) {
    console.error("Initialize Job Stages Error:", error);
    return handleControllerError(res, error, error.message || "Internal server error.");
  }
}

// ── Get a job's stage progress ────────────────────────────────────────────────
export async function getJobStages(req, res) {
  const builderId = req.user?.builder_id;
  const companyId = req.user?.company_id;
  const { jobId } = req.params;
  const { workflow_type } = req.query;

  try {
    if (!builderId) {
      return errorResponse(res, 403, "Unauthorized. Builder login required.");
    }

    const result = await getJobStagesService({ jobId, builderId, companyId, workflow_type });
    return successResponse(res, keysToCamelCase(result), "Job stages fetched successfully.");
  } catch (error) {
    console.error("Get Job Stages Error:", error);
    return handleControllerError(res, error, error.message || "Internal server error.");
  }
}

// ── Update a single job stage status ──────────────────────────────────────────
export async function updateJobStageStatus(req, res) {
  const builderId = req.user?.builder_id;
  const companyId = req.user?.company_id;
  const userId = req.user?.user_id;
  const { jobId, jobConstructionStageId } = req.params;
  const { status } = req.body;

  try {
    if (!builderId) {
      return errorResponse(res, 403, "Unauthorized. Builder login required.");
    }

    const result = await updateJobStageStatusService({
      jobId,
      jobConstructionStageId,
      status,
      builderId,
      companyId,
      userId,
    });

    return successResponse(res, keysToCamelCase(result), "Job stage status updated successfully.");
  } catch (error) {
    console.error("Update Job Stage Status Error:", error);
    return handleControllerError(res, error, error.message || "Internal server error.");
  }
}
