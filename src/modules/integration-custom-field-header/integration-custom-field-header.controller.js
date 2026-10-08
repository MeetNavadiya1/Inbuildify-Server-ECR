import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import {
  createIntegrationCustomFieldHeaderService,
  getAllIntegrationCustomFieldHeaderService,
  deleteIntegrationCustomFieldHeaderService,
  updateIntegrationCustomFieldHeaderService,
} from "./integration-custom-field-header.service.js";

// ─── Shared guard ─────────────────────────────────────────────────────────────

/** Returns true when both builder_id and company_id are absent from user context. */
function missingUserContext(builderId, companyId) {
  return !builderId && !companyId;
}

// ─── CREATE INTEGRATION CUSTOM FIELD HEADER ───────────────────────────────────

export async function createIntegrationCustomFieldHeader(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.users_id;

    if (missingUserContext(builderId, companyId)) {
      return errorResponse(res, 401, "Unauthorized: Missing builder or company ID.");
    }

    const { header_name } = req.body;

    if (!header_name || header_name.trim() === "") {
      return errorResponse(res, 400, "Header name is required.");
    }

    const result = await createIntegrationCustomFieldHeaderService({
      builderId,
      companyId,
      userId,
      header_name,
    });

    if (result.error) {
      return errorResponse(res, result.error.status, result.error.message);
    }

    return successResponse(
      res,
      result.data,
      "Integration custom field header created successfully.",
    );
  } catch (err) {
    console.error("Error creating integration custom field header:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error.");
  }
}

// ─── GET ALL INTEGRATION CUSTOM FIELD HEADERS ─────────────────────────────────

export async function getAllIntegrationCustomFieldHeader(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (missingUserContext(builderId, companyId)) {
      return errorResponse(res, 401, "Unauthorized: Missing builder or company ID.");
    }

    const { page, limit } = req.query;

    const result = await getAllIntegrationCustomFieldHeaderService({
      builderId,
      companyId,
      page,
      limit,
    });

    return successResponse(
      res,
      result.data,
      "Integration custom field headers fetched successfully.",
    );
  } catch (error) {
    console.error("Error fetching integration custom field headers:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error.");
  }
}

// ─── DELETE INTEGRATION CUSTOM FIELD HEADER ───────────────────────────────────

export async function deleteIntegrationCustomFieldHeader(req, res) {
  try {
    const { integration_custom_field_header_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!integration_custom_field_header_id) {
      return errorResponse(res, 400, "integration_custom_field_header_id is required.");
    }

    if (missingUserContext(builderId, companyId)) {
      return errorResponse(res, 401, "Unauthorized: Missing builder or company ID.");
    }

    const result = await deleteIntegrationCustomFieldHeaderService({
      integration_custom_field_header_id,
      builderId,
      companyId,
    });

    if (result.error) {
      return errorResponse(res, result.error.status, result.error.message);
    }

    return successResponse(
      res,
      null,
      "Integration custom field header deleted successfully.",
    );
  } catch (error) {
    console.error("Delete Integration Header Error:", error);
    return handleControllerError(res, error, "Internal server error.");
  }
}

// ─── UPDATE INTEGRATION CUSTOM FIELD HEADER ───────────────────────────────────

export async function updateIntegrationCustomFieldHeader(req, res) {
  try {
    const { integration_custom_field_header_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.users_id;

    if (!integration_custom_field_header_id) {
      return errorResponse(res, 400, "integration_custom_field_header_id is required.");
    }

    if (missingUserContext(builderId, companyId)) {
      return errorResponse(res, 401, "Unauthorized: Missing builder or company ID.");
    }

    const { header_name } = req.body;

    const result = await updateIntegrationCustomFieldHeaderService({
      integration_custom_field_header_id,
      builderId,
      companyId,
      userId,
      header_name,
    });

    if (result.error) {
      return errorResponse(res, result.error.status, result.error.message);
    }

    return successResponse(
      res,
      result.data,
      "Integration custom field header updated successfully.",
    );
  } catch (error) {
    console.error("Error updating integration custom field header:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error.");
  }
}
