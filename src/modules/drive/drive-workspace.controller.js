import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import * as workspaceService from "./drive-workspace.service.js";
import { hasFullDriveAccess } from "./drive.scope.js";

/**
 * GET /drive/workspace — tells the client which S Drive to render.
 *
 * The frontend uses `mode` to pick the tab set. It is a convenience only: every
 * data endpoint enforces the same rule server-side, so a client that lies about
 * its mode still gets nothing it is not entitled to.
 */
export const getWorkspace = async (req, res) => {
  try {
    const fullAccess = await hasFullDriveAccess(req.user);
    return successResponse(
      res,
      keysToCamelCase({
        mode: fullAccess ? "full" : "restricted",
        role_name: req.user?.role_name || null,
        can_upload: fullAccess,
        can_create_folder: fullAccess,
        can_delete: fullAccess,
        can_manage_permissions: fullAccess,
      }),
      "Drive workspace resolved.",
    );
  } catch (error) {
    console.error("[Workspace] getWorkspace error:", error);
    return handleControllerError(res, error, "Failed to resolve drive workspace.");
  }
};

export const getMyLeads = async (req, res) => {
  try {
    const result = await workspaceService.getMyLeadsService(req.user);
    return successResponse(res, keysToCamelCase(result), "Leads fetched.");
  } catch (error) {
    console.error("[Workspace] getMyLeads error:", error);
    return handleControllerError(res, error, "Failed to fetch leads.");
  }
};

export const getMyJobs = async (req, res) => {
  try {
    const result = await workspaceService.getMyJobsService(req.user);
    return successResponse(res, keysToCamelCase(result), "Jobs fetched.");
  } catch (error) {
    console.error("[Workspace] getMyJobs error:", error);
    return handleControllerError(res, error, "Failed to fetch jobs.");
  }
};

/**
 * Documents for one lead or job. A 404 here is deliberate for an entity that
 * exists but is not the caller's — it leaks nothing about whether the id is real.
 */
export const getEntityDocuments = async (req, res) => {
  try {
    const { type, id } = req.params;
    const result = await workspaceService.getEntityDocumentsService(type, id, req.user);
    if (!result) {
      return errorResponse(res, 404, "Not found.");
    }
    return successResponse(res, keysToCamelCase(result), "Documents fetched.");
  } catch (error) {
    console.error("[Workspace] getEntityDocuments error:", error);
    return handleControllerError(res, error, "Failed to fetch documents.");
  }
};

export const getSharedDocuments = async (req, res) => {
  try {
    const result = await workspaceService.getSharedDocumentsService(req.user);
    return successResponse(res, keysToCamelCase(result), "Shared documents fetched.");
  } catch (error) {
    console.error("[Workspace] getSharedDocuments error:", error);
    return handleControllerError(res, error, "Failed to fetch shared documents.");
  }
};
