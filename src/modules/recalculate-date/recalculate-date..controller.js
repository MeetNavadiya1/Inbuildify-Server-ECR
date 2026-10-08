import { errorResponse, successResponse, handleControllerError } from "../../helper/response.js";
import { getOrCreateRecalculateDateService, updateRecalculateDateService } from "./recalculate-date.service.js";

export async function getRecalculateDate(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.user_id || req.user?.users_id;

    const { data, isNew } = await getOrCreateRecalculateDateService({
      builderId,
      companyId,
      userId,
    });

    const message = isNew
      ? "Recalculate Date settings created and fetched successfully."
      : "Recalculate Date settings fetched successfully.";

    return successResponse(res, data, message);
  } catch (error) {
    console.error("Error fetching recalculate date:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function updateRecalculateDate(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.user_id;

    const data = await updateRecalculateDateService({
      builderId,
      companyId,
      userId,
      data: req.body,
    });

    return successResponse(
      res,
      data,
      "Recalculate Date settings updated successfully.",
    );
  } catch (error) {
    console.error("Error updating recalculate date:", error);
    return errorResponse(
      res,
      error.status || 500,
      error.message || "Internal Server Error",
    );
  }
}
