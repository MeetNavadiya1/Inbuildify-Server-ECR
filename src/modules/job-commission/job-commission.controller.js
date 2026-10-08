

import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  createJobCommissionService,
  getAllJobCommissionsService,
  deleteJobCommissionService,
  updateJobCommissionService,
} from "./job-commission.service.js";

// CREATE
export async function createJobCommission(req, res) {
  try {
    const result = await createJobCommissionService(req.body, req.user);

    return successResponse(res, keysToCamelCase(result), "Created successfully");
  } catch (err) {
    return errorResponse(res, 400, err.message);
  }
}

// GET ALL
export async function getAllJobCommissions(req, res) {
  try {
    const result = await getAllJobCommissionsService(req.user, req.query);

    return successResponse(
      res,
      {
        jobCommission: keysToCamelCase(result.data),
        pagination: result.pagination,
      },
      "Fetched successfully",
    );
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

// DELETE
export async function deleteJobCommission(req, res) {
  try {
    await deleteJobCommissionService(req.params.job_commission_id, req.user);

    return successResponse(res, null, "Deleted successfully");
  } catch (err) {
    return errorResponse(res, 400, err.message);
  }
}

// UPDATE
export async function updateJobCommission(req, res) {
  try {
    const result = await updateJobCommissionService(
      req.params.job_commission_id,
      req.body,
      req.user,
    );

    return successResponse(res, keysToCamelCase(result), "Updated successfully");
  } catch (err) {
    return errorResponse(res, 400, err.message);
  }
}
