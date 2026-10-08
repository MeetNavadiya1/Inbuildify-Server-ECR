
import { errorResponse, successResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import { createSalesProcessService, deleteSalesProcessService, getAllSalesProcessService, updateSalesProcessService } from "./sales-process.service.js";

// ✅ CREATE
export async function createSalesProcess(req, res) {
  try {
    const { name } = req.body;

    if (!name) {
      return errorResponse(res, 400, "Name is required.");
    }

    const result = await createSalesProcessService(req.body, req.user);

    return successResponse(
      res,
      keysToCamelCase(result),
      "Sales process created successfully.",
    );
  } catch (error) {
    return handleControllerError(res, error, error.message);
  }
}

// ✅ GET ALL
export async function getAllSalesProcess(req, res) {
  try {
    const builderId = req.user?.builder_id;

    if (!builderId) {
      return errorResponse(res, 401, "Unauthorized");
    }

    const result = await getAllSalesProcessService(builderId);

    return successResponse(
      res,
      keysToCamelCase(result),
      "Sales process fetched successfully.",
    );
  } catch (error) {
    return handleControllerError(res, error, error.message);
  }
}

// ✅ DELETE
export async function deleteSalesProcess(req, res) {
  try {
    const { id } = req.params;

    if (!id) {
      return errorResponse(res, 400, "ID is required");
    }

    await deleteSalesProcessService(id, req.user.builder_id);

    return successResponse(res, null, "Deleted successfully");
  } catch (error) {
    return handleControllerError(res, error, error.message);
  }
}

// ✅ UPDATE
export async function updateSalesProcess(req, res) {
  try {
    const { id } = req.params;
    const { name, is_default } = req.body;

    if (name === undefined && is_default === undefined) {
      return errorResponse(res, 400, "At least one field required");
    }

    const result = await updateSalesProcessService(
      id,
      req.body,
      req.user,
    );

    return successResponse(
      res,
      keysToCamelCase(result),
      "Updated successfully",
    );
  } catch (error) {
    return handleControllerError(res, error, error.message);
  }
}
