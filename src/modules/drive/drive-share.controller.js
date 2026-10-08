import { successResponse, errorResponse } from "../../helper/response.js";
import * as shareService from "./drive-share.service.js";
import { keysToCamelCase } from "../../utils/common.js";
import { attachPermissions } from "./drive.permissions.js";

export const createShare = async (req, res) => {
  try {
    const userId = req.user?.users_id;
    const companyId = req.user?.company_id;
    const share = await shareService.createShareService(req.body, userId, companyId, req.user);
    const responseData = keysToCamelCase(share);
    if (responseData.entityType) responseData.entityType = responseData.entityType.toLowerCase();
    return successResponse(res, responseData, "Item shared successfully.", 201);
  } catch (error) {
    console.error("[Share] createShare error:", error);
    return errorResponse(res, 400, error.message);
  }
};

/**
 * Share one item with several users at once (the Share popup).
 * Returns per-user outcomes so the UI can report partial success instead of
 * failing the whole batch when one target is already on the list.
 */
export const createBulkShare = async (req, res) => {
  try {
    const userId = req.user?.users_id;
    const companyId = req.user?.company_id;
    const result = await shareService.createBulkShareService(req.body, userId, companyId, req.user);
    const responseData = keysToCamelCase(result);
    if (responseData.entityType) responseData.entityType = responseData.entityType.toLowerCase();

    const { sharedCount, skippedCount } = responseData;
    const message = sharedCount === 0
      ? "No new users were added — they already have access."
      : `Shared with ${sharedCount} user${sharedCount === 1 ? "" : "s"}.${
          skippedCount ? ` ${skippedCount} skipped.` : ""
        }`;

    return successResponse(res, responseData, message, 201);
  } catch (error) {
    console.error("[Share] createBulkShare error:", error);
    return errorResponse(res, 400, error.message);
  }
};

export const updateShare = async (req, res) => {
  try {
    const { id } = req.params;
    const { permission_level } = req.body;
    const userId = req.user?.users_id;
    const companyId = req.user?.company_id;
    const share = await shareService.updateShareService(id, permission_level, userId, companyId, req.user);
    const responseData = keysToCamelCase(share);
    if (responseData.entityType) responseData.entityType = responseData.entityType.toLowerCase();
    return successResponse(res, responseData, "Share permission updated.", 200);
  } catch (error) {
    console.error("[Share] updateShare error:", error);
    return errorResponse(res, 400, error.message);
  }
};

export const deleteShare = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.users_id;
    const companyId = req.user?.company_id;
    await shareService.deleteShareService(id, userId, companyId, req.user);
    return successResponse(res, null, "Share revoked.", 200);
  } catch (error) {
    console.error("[Share] deleteShare error:", error);
    return errorResponse(res, 400, error.message);
  }
};

export const getSharedWithMe = async (req, res) => {
  try {
    const userId = req.user?.users_id;
    const companyId = req.user?.company_id;
    const result = await shareService.getSharedWithMeService(userId, companyId);
    // The effective level, not just the level on this row — a second share, or
    // one on a parent folder, can outrank it.
    result.items = await attachPermissions(req.user, companyId, result.items);
    const responseData = keysToCamelCase(result);
    if (responseData.items) {
      responseData.items = responseData.items.map(item => ({
        ...item,
        entityType: item.entityType?.toLowerCase()
      }));
    }
    return successResponse(res, responseData, "Shared items fetched.", 200);
  } catch (error) {
    console.error("[Share] getSharedWithMe error:", error);
    return errorResponse(res, 400, error.message);
  }
};

export const getEntityShares = async (req, res) => {
  try {
    const { type, id } = req.params;
    const companyId = req.user?.company_id;
    const result = await shareService.getEntitySharesService(type, id, companyId, req.user?.users_id, req.user);
    const responseData = keysToCamelCase(result);
    if (responseData.items) {
      responseData.items = responseData.items.map(item => ({
        ...item,
        entityType: item.entityType?.toLowerCase()
      }));
    }
    return successResponse(res, responseData, "Entity shares fetched.", 200);
  } catch (error) {
    console.error("[Share] getEntityShares error:", error);
    return errorResponse(res, 400, error.message);
  }
};
