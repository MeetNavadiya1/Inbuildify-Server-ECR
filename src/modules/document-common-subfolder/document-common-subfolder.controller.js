import subfolderService from "./document-common-subfolder.service.js";
import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";

/**
 * CREATE DOCUMENT COMMON SUBFOLDER
 */
export async function createDocumentCommonSubfolder(req, res) {
  try {
    const { document_common_folder_id, parent_subfolder_id, name } = req.body;
    const builderId = req.user?.builder_id;
    const userId = req.user?.users_id;

    if (!builderId) {
      return errorResponse(res, 401, "Unauthorized: builder ID missing");
    }

    if (!document_common_folder_id && !parent_subfolder_id) {
      return errorResponse(
        res,
        400,
        "Either document_common_folder_id or parent_subfolder_id must be provided.",
      );
    }

    if (!name) {
      return errorResponse(res, 400, "Subfolder name is required.");
    }

    const result = await subfolderService.createDocumentCommonSubfolderService(
      req.body,
      builderId,
      userId,
    );

    return successResponse(
      res,
      result,
      "Document subfolder created successfully.",
    );
  } catch (error) {
    console.error("Error creating document subfolder:", error);
    return handleControllerError(res, error,
      error.message || "Internal server error.",
    );
  }
}

/**
 * GET DOCUMENT COMMON SUBFOLDER TREE
 */
export async function getDocumentCommonSubfolderTree(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const { document_common_folder_id } = req.params;

    const result = await subfolderService.getDocumentCommonSubfolderTreeService(
      document_common_folder_id,
      builderId,
    );

    return successResponse(
      res,
      result,
      "Document subfolder tree fetched successfully.",
    );
  } catch (error) {
    console.error("Error fetching document subfolder tree:", error);
    return handleControllerError(res, error,
      error.message || "Internal server error.",
    );
  }
}

/**
 * GET DOCUMENT COMMON SUBFOLDER BY FOLDER ID
 */
export async function getDocumentCommonSubfolderByFolderId(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const { document_common_folder_id } = req.params;
    const { parent_subfolder_id } = req.query;

    const result = await subfolderService.getDocumentCommonSubfolderByFolderIdService(
      document_common_folder_id,
      builderId,
      parent_subfolder_id,
    );

    return successResponse(
      res,
      result,
      "Document common subfolders fetched successfully.",
    );
  } catch (error) {
    console.error("Error fetching document common subfolders by folder_id:", error);
    return handleControllerError(res, error,
      error.message || "Internal server error.",
    );
  }
}

/**
 * DELETE DOCUMENT COMMON SUBFOLDER
 */
export async function deleteDocumentCommonSubfolder(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const { document_common_subfolder_id } = req.params;

    await subfolderService.deleteDocumentCommonSubfolderService(
      document_common_subfolder_id,
      builderId,
    );

    return successResponse(
      res,
      null,
      "Document common subfolder deleted successfully.",
    );
  } catch (error) {
    console.error("Error deleting document common subfolder:", error);
    return handleControllerError(res, error,
      error.message || "Internal server error.",
    );
  }
}

/**
 * UPDATE DOCUMENT COMMON SUBFOLDER
 */
export async function updateDocumentCommonSubfolder(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const userId = req.user?.users_id;
    const { document_common_subfolder_id } = req.params;
    const { name, sort_order } = req.body;

    if (name === undefined && sort_order === undefined) {
      return errorResponse(res, 400, "No fields provided for update.");
    }

    const result = await subfolderService.updateDocumentCommonSubfolderService(
      document_common_subfolder_id,
      req.body,
      builderId,
      userId,
    );

    return successResponse(
      res,
      result,
      "Document common subfolder updated successfully.",
    );
  } catch (error) {
    console.error("Error updating document common subfolder:", error);
    return handleControllerError(res, error,
      error.message || "Internal server error.",
    );
  }
}
