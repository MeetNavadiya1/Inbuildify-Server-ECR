import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import {
  getPasswordPolicyService,
  updatePasswordPolicyService,

} from "./password-policy.service.js";

export async function getPasswordPolicy(req, res) {
  const { company_id, builder_id, user_id } = req.user;

  try {
    if (!company_id && !builder_id) {
      return errorResponse(res, 400, "Company or builder context is required");
    }

    const result = await getPasswordPolicyService({ companyId: company_id, builderId: builder_id, userId: user_id });

    return successResponse(res, result, "Password policy fetched successfully");
  } catch (error) {
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function updatePasswordPolicy(req, res) {
  const builderId = req.user.builder_id;
  const companyId = req.user?.company_id;
  const userId = req.user.user_id;

  try {
    if (!builderId || !companyId) {
      return errorResponse(res, 401, "Unauthorized.");
    }

    const result = await updatePasswordPolicyService({
      builderId,
      companyId,
      userId,
      payload: req.body,
    });

    return successResponse(res, result, "Password policy updated successfully.");
  } catch (error) {
    console.error("Error updating password policy:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}
