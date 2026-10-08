
import { errorResponse, successResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import { createLeadLostReasonService, deleteLeadLostReasonService, getAllLeadLostReasonService, updateLeadLostReasonActiveService, updateLeadLostReasonService } from "./lead-lost-reason.service.js";

// ✅ CREATE
export async function createLeadLostReason(req, res) {
  try {
    if (!req.body.lost_reason) {
      return errorResponse(res, 400, "lost_reason is required");
    }

    const result = await createLeadLostReasonService(req.body, req.user);

    return successResponse(res, keysToCamelCase(result), "Created successfully");
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

// ✅ GET ALL
export async function getAllLeadLostReasons(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;

    const { data, total } = await getAllLeadLostReasonService(
      req.user,
      page,
      limit,
    );

    return successResponse(res, {
      leadLostReason: keysToCamelCase(data),
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

// ✅ DELETE
export async function deleteLeadLostReason(req, res) {
  try {
    await deleteLeadLostReasonService(
      req.params.id,
      req.user.builder_id,
    );

    return successResponse(res, null, "Deleted successfully");
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

// ✅ UPDATE
export async function updateLeadLostReason(req, res) {
  try {
    const result = await updateLeadLostReasonService(
      req.params.id,
      req.body,
      req.user,
    );

    return successResponse(res, keysToCamelCase(result), "Updated successfully");
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

// ✅ UPDATE ACTIVE
export async function updateLeadLostReasonIsActive(req, res) {
  try {
    const result = await updateLeadLostReasonActiveService(
      req.params.id,
      req.body.is_active,
      req.user,
    );

    return successResponse(res, keysToCamelCase(result), "Status updated");
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}
