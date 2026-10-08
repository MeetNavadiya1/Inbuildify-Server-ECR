import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  getAllVariationApprovalsService,
  createVariationApprovalService,
  updateVariationApprovalService,
  deleteVariationApprovalService,
} from "./job-variation-approval.service.js";

/**
 * CREATE A JOB VARIATION APPROVAL
 */
export async function createJobVariationApproval(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.users_id;

    if (!companyId && !builderId) {
      return errorResponse(res, 401, "Unauthorized.");
    }

    const result = await createVariationApprovalService({
      builderId,
      companyId,
      userId,
      data: req.body,
    });

    return successResponse(
      res,
      result,
      "Job variation approval created successfully.",
    );
  } catch (error) {
    console.error("Error creating job variation approval:", error);
    return handleControllerError(res, error,
      error.message || "Internal Server Error",
    );
  }
}

/**
 * FETCH ALL JOB VARIATION APPROVALS
 */
export async function getJobVariationApprovals(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!companyId && !builderId) {
      return errorResponse(res, 401, "Unauthorized.");
    }

    const results = await getAllVariationApprovalsService({
      builderId,
      companyId,
    });

    return successResponse(res, results);
  } catch (error) {
    console.error("Error fetching job variation approvals:", error);
    return handleControllerError(res, error, "Internal Server Error");
  }
}

/**
 * DELETE A JOB VARIATION APPROVAL
 */
export async function deleteJobVariationApproval(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const { id } = req.params;

    if (!companyId && !builderId) {
      return errorResponse(res, 401, "Unauthorized.");
    }

    await deleteVariationApprovalService({
      id,
      builderId,
      companyId,
    });

    return successResponse(
      res,
      null,
      "Job variation approval deleted successfully.",
    );
  } catch (error) {
    console.error("Error deleting job variation approval:", error);
    return handleControllerError(res, error,
      error.message || "Internal Server Error",
    );
  }
}

/**
 * UPDATE A JOB VARIATION APPROVAL
 */
export async function updateJobVariationApproval(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.users_id;
    const { id } = req.params;
    const { role_id, amount } = req.body;

    if (!companyId && !builderId) {
      return errorResponse(res, 401, "Unauthorized.");
    }

    if (!role_id && !amount) {
      return errorResponse(
        res,
        400,
        "At least one field must be provided for update.",
      );
    }

    const result = await updateVariationApprovalService({
      id,
      builderId,
      companyId,
      userId,
      data: req.body,
    });

    return successResponse(
      res,
      result,
      "Job variation approval updated successfully.",
    );
  } catch (error) {
    console.error("Error updating job variation approval:", error);
    return handleControllerError(res, error,
      error.message || "Internal Server Error",
    );
  }
}
