

import { errorResponse, successResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import { createLeadSourceService, deleteLeadSourceService, getLeadSourceByIdService, getLeadSourcesService, updateLeadSourceActiveService, updateLeadSourceService } from "./lead-source.service.js";

// ✅ CREATE
export async function createLeadSource(req, res) {
  try {
    if (!req.body.name) {
      return errorResponse(res, 400, "Name is required");
    }

    const result = await createLeadSourceService(req.body, req.user);

    return successResponse(res, keysToCamelCase(result), "Created successfully");
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

// ✅ GET ALL
export async function getLeadSources(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;

    const { data, total } = await getLeadSourcesService(
      req.user.builder_id,
      page,
      limit,
    );

    return successResponse(res, {
      leadSource: keysToCamelCase(data),
      pagination: {
        totalRecords: total,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        limit,
      },
    });
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

// ✅ GET BY ID
export async function getLeadSourceById(req, res) {
  try {
    const result = await getLeadSourceByIdService(
      req.params.lead_source_id,
      req.user.builder_id,
    );

    return successResponse(res, keysToCamelCase(result), "Fetched successfully");
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

// ✅ UPDATE
export async function updateLeadSource(req, res) {
  try {
    const result = await updateLeadSourceService(
      req.params.lead_source_id,
      req.body,
      req.user,
    );

    return successResponse(res, keysToCamelCase(result), "Updated successfully");
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

// ✅ DELETE
export async function deleteLeadSource(req, res) {
  try {
    await deleteLeadSourceService(
      req.params.lead_source_id,
      req.user.builder_id,
    );

    return successResponse(res, null, "Deleted successfully");
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

// ✅ UPDATE ACTIVE
export async function updateLeadSourceIsActive(req, res) {
  try {
    const result = await updateLeadSourceActiveService(
      req.params.lead_source_id,
      req.body.is_active,
      req.user,
    );

    return successResponse(res, keysToCamelCase(result), "Status updated");
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}
