
import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import {
  createMaintenanceSettingsService,
  updateMaintenanceSettingsService,
  getUserMaintenanceSettingsService,
} from "./maintenance-settings.service.js";

// ─── Shared guard ─────────────────────────────────────────────────────────────

/** Returns true when both builder_id and company_id are absent from user context. */
function missingUserContext(builderId, companyId) {
  return !builderId && !companyId;
}

// ─── CREATE MAINTENANCE SETTINGS ─────────────────────────────────────────────

export async function createMaintenanceSettings(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const createdBy = req.user?.users_id;

    if (missingUserContext(builderId, companyId)) {
      return errorResponse(res, 401, "Unauthorized: Builder or Company ID missing.");
    }

    const {
      area_enabled,
      supplier_enabled,
      allow_completion_without_supplier_response,
      request_date_enabled,
      task_date_enabled,
      repair_cost_enabled,
      hours_spent_enabled,
      maintenance_start_date,
      handover_date,
      maintenance_period_days,
      maintenance_duration_days,
      supervisor_roles,
    } = req.body;

    const result = await createMaintenanceSettingsService({
      builderId,
      companyId,
      createdBy,
      area_enabled,
      supplier_enabled,
      allow_completion_without_supplier_response,
      request_date_enabled,
      task_date_enabled,
      repair_cost_enabled,
      hours_spent_enabled,
      maintenance_start_date,
      handover_date,
      maintenance_period_days,
      maintenance_duration_days,
      supervisor_roles,
    });

    if (result.error) {
      return errorResponse(res, result.error.status, result.error.message);
    }

    return successResponse(res, result.data, "Maintenance settings created successfully.");
  } catch (error) {
    console.error("Error creating maintenance settings:", error);
    return errorResponse(res, 500, "Internal server error.", error.message);
  }
}

// ─── UPDATE MAINTENANCE SETTINGS ─────────────────────────────────────────────

export async function updateMaintenanceSettings(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.users_id;

    if (missingUserContext(builderId, companyId)) {
      return errorResponse(res, 401, "Unauthorized: Builder or Company ID missing.");
    }

    const {
      area_enabled,
      supplier_enabled,
      allow_completion_without_supplier_response,
      request_date_enabled,
      task_date_enabled,
      repair_cost_enabled,
      hours_spent_enabled,
      maintenance_start_date,
      maintenance_period_days,
      maintenance_duration_days,
      supervisor_roles,
    } = req.body;

    const result = await updateMaintenanceSettingsService({
      builderId,
      companyId,
      userId,
      area_enabled,
      supplier_enabled,
      allow_completion_without_supplier_response,
      request_date_enabled,
      task_date_enabled,
      repair_cost_enabled,
      hours_spent_enabled,
      maintenance_start_date,
      maintenance_period_days,
      maintenance_duration_days,
      supervisor_roles,
    });

    if (result.error) {
      return errorResponse(res, result.error.status, result.error.message);
    }

    return successResponse(res, result.data, "Maintenance settings updated successfully.");
  } catch (error) {
    console.error("Error updating maintenance settings:", error);
    return handleControllerError(res, error, error.message || "Internal server error.");
  }
}

// ─── GET USER MAINTENANCE SETTINGS ───────────────────────────────────────────

export async function getUserMaintenanceSettings(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.users_id;

    if (missingUserContext(builderId, companyId)) {
      return errorResponse(res, 401, "Unauthorized: Builder or Company ID missing.");
    }

    const result = await getUserMaintenanceSettingsService({
      builderId,
      companyId,
      userId,
    });

    return successResponse(res, result.data, "Maintenance settings fetched successfully.");
  } catch (error) {
    console.error("Error fetching maintenance settings:", error);
    return handleControllerError(res, error, error.message || "Internal server error.");
  }
}
