import { errorResponse, successResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import { createClientTypeService, deleteClientTypeService, getAllClientTypeService, updateClientTypeActiveService, updateClientTypeService } from "./client-type.service.js";

// ✅ CREATE
export async function createClientType(req, res) {
  try {
    if (!req.body.client_type) {
      return errorResponse(res, 400, "client_type is required");
    }

    const result = await createClientTypeService(req.body, req.user);

    return successResponse(res, keysToCamelCase(result), "Created successfully");
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

// ✅ GET ALL
export async function getAllClientType(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;

    const { data, total } = await getAllClientTypeService(
      req.user,
      page,
      limit,
    );

    return successResponse(res, {
      clientType: keysToCamelCase(data),
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
export async function deleteClientType(req, res) {
  try {
    await deleteClientTypeService(
      req.params.id,
      req.user.builder_id,
    );

    return successResponse(res, null, "Deleted successfully");
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

// ✅ UPDATE
export async function updateClientType(req, res) {
  try {
    const result = await updateClientTypeService(
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
export async function updateClientTypeIsActive(req, res) {
  try {
    const result = await updateClientTypeActiveService(
      req.params.id,
      req.body.is_active,
      req.user,
    );

    return successResponse(res, keysToCamelCase(result), "Status updated");
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}
