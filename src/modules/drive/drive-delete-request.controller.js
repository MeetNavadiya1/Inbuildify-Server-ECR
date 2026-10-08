import { successResponse, errorResponse } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import * as deleteRequestService from "./drive-delete-request.service.js";

/** POST /drive/delete-requests — a shared user asks the owner to delete an item. */
export const createDeleteRequest = async (req, res) => {
  try {
    const result = await deleteRequestService.createDeleteRequestService(req.body, req.user);
    const data = keysToCamelCase(result);
    if (data.entityType) data.entityType = data.entityType.toLowerCase();
    return successResponse(
      res,
      data,
      `Request sent to ${result.owner_name || "the owner"} for approval.`,
      201,
    );
  } catch (error) {
    console.error("[DriveDeleteRequest] createDeleteRequest error:", error);
    return errorResponse(res, 400, error.message);
  }
};

/**
 * GET /drive/delete-requests/:request_id/public-details?token=…
 * The owner's review page, opened from the email without a session.
 */
export const getDeleteRequestPublicDetails = async (req, res) => {
  try {
    const result = await deleteRequestService.getDeleteRequestPublicDetailsService(
      req.params.request_id,
      req.query.token,
    );
    return successResponse(res, keysToCamelCase(result), "Delete request fetched successfully.");
  } catch (error) {
    console.error("[DriveDeleteRequest] getDeleteRequestPublicDetails error:", error);
    return errorResponse(res, 400, error.message);
  }
};

/** POST /drive/delete-requests/:request_id/respond — the owner approves or rejects. */
export const respondDeleteRequest = async (req, res) => {
  try {
    const result = await deleteRequestService.respondToDeleteRequestService(
      req.params.request_id,
      req.body,
    );
    let message = "The request has been rejected. Nothing was deleted.";
    if (result.status === "APPROVED") {
      message = result.already_deleted
        ? "This item was already in Trash, so nothing was deleted. The request is closed."
        : "Approved — the item has been moved to Trash.";
    }
    return successResponse(res, keysToCamelCase(result), message);
  } catch (error) {
    console.error("[DriveDeleteRequest] respondDeleteRequest error:", error);
    return errorResponse(res, 400, error.message);
  }
};

export default {
  createDeleteRequest,
  getDeleteRequestPublicDetails,
  respondDeleteRequest,
};
