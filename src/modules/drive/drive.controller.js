import * as driveService from "./drive.service.js";
import { errorResponse, successResponse, handleControllerError } from "../../helper/response.js";
import { reorderItemsService } from "./drive-reorder.service.js";
import { getThumbnailUrlService } from "./drive-thumbnail.service.js";
import { keysToCamelCase } from "../../utils/common.js";
import { attachPermissions, hasAtLeast } from "./drive.permissions.js";

/**
 * Stamp each listed row with the caller's effective permission (VIEW / EDIT /
 * ADMIN) so the row menu can offer Delete only at EDIT and Manage Access only
 * at ADMIN. Purely presentational — every action is checked again by
 * requireDrivePermission when it is actually called.
 */
const withPermissions = (req, items) => attachPermissions(req.user, req.user?.company_id, items);

/** Same, for the { folders, files, items } shape the folder-contents route returns. */
const withPermissionsOnGroups = async (req, payload) => {
  const [folders, files, items] = await Promise.all([
    withPermissions(req, payload.folders),
    withPermissions(req, payload.files),
    withPermissions(req, payload.items),
  ]);
  return { ...payload, folders, files, items };
};

// --- Folder APIs ---

// 1. Create folder flow
export const createFolder = async (req, res) => {
  try {
    const { name, parent_id, reference_id, reference_type } = req.body;
    const companyId = req.user?.company_id;
    const builderId = req.user?.builder_id;
    const userId = req.user?.users_id;

    if (!name) {
      return errorResponse(res, 400, "Folder name is required.");
    }

    const folder = await driveService.createFolderService({
      name,
      parent_id,
      company_id: companyId,
      builder_id: builderId,
      created_by: userId,
      updated_by: userId,
      reference_id,
      reference_type
    });

    return successResponse(res, keysToCamelCase(folder), "Folder created successfully.", 201);
  } catch (error) {
    console.error("Error creating folder:", error);
    return errorResponse(res, 400, error.message);
  }
};

// 3. Read folder content flow
export const getFolderContents = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.user?.company_id;
    const builderId = req.user?.builder_id;

    const folderId = id === "root" ? null : id;

    const contents = await driveService.getFolderContentsService(folderId, companyId, builderId, req.user);

    return successResponse(res, keysToCamelCase(await withPermissionsOnGroups(req, contents)), "Folder contents fetched successfully.");
  } catch (error) {
    console.error("Error fetching folder contents:", error);
    return handleControllerError(res, error, "Failed to fetch folder contents.");
  }
};

export const getRootFolders = async (req, res) => {
  try {
    const companyId = req.user?.company_id;
    const builderId = req.user?.builder_id;
    const referenceId = req.query.reference_id;
    const referenceType = req.query.reference_type;

    const folders = await driveService.getRootFoldersService(companyId, builderId, referenceId, referenceType, req.user);
    return successResponse(res, keysToCamelCase(await withPermissions(req, folders)), "Root folders fetched successfully.");
  } catch (error) {
    console.error("Error fetching root folders:", error);
    return handleControllerError(res, error, "Failed to fetch root folders.");
  }
};

/**
 * GET /drive/folders/move-targets — where a document may be moved to.
 *
 * User-created folders only (the service drops the generated buckets and the
 * entity Documents trees), narrowed again here to the ones the caller may write
 * into: filing a document into a folder is a change to that folder, so the bar
 * is EDIT, exactly as moveFile applies to the destination it is handed.
 */
export const getMoveTargetFolders = async (req, res) => {
  try {
    const companyId = req.user?.company_id;
    const builderId = req.user?.builder_id;

    const folders = await driveService.getMoveTargetFoldersService(companyId, builderId, req.user);
    const withPermission = await withPermissions(req, folders);
    const targets = withPermission.filter((f) => hasAtLeast(f.permission, "EDIT"));

    return successResponse(res, keysToCamelCase(targets), "Move destinations fetched successfully.");
  } catch (error) {
    console.error("Error fetching move destinations:", error);
    return handleControllerError(res, error, "Failed to fetch move destinations.");
  }
};

export const renameFolder = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const companyId = req.user?.company_id;
    const userId = req.user?.users_id;

    if (!name) {
      return errorResponse(res, 400, "New folder name is required.");
    }

    const updatedFolder = await driveService.renameFolderService(id, name, companyId, userId);
    return successResponse(res, keysToCamelCase(updatedFolder), "Folder renamed successfully.");
  } catch (error) {
    console.error("Error renaming folder:", error);
    return errorResponse(res, 400, error.message);
  }
};

export const deleteFolder = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.user?.company_id;

    await driveService.deleteFolderService(id, companyId);
    return successResponse(res, null, "Folder deleted successfully.");
  } catch (error) {
    console.error("Error deleting folder:", error);
    return errorResponse(res, 400, error.message);
  }
};

// --- File APIs ---

// 2. Upload file flow
export const uploadFile = async (req, res) => {
  try {
    const { folder_id } = req.body;
    const file = req.file;
    const companyId = req.user?.company_id;
    const builderId = req.user?.builder_id;
    const userId = req.user?.users_id;

    if (!file) {
      return errorResponse(res, 400, "File is required.");
    }

    const uploadedFile = await driveService.uploadFileService(file, {
      folder_id: folder_id === "root" ? null : folder_id,
      company_id: companyId,
      builder_id: builderId,
      uploaded_by: userId
    });

    return successResponse(res, keysToCamelCase(uploadedFile), "File uploaded successfully.", 201);
  } catch (error) {
    console.error("Error uploading file:", error);
    return handleControllerError(res, error, error.message);
  }
};

export const getFilesInFolder = async (req, res) => {
  try {
    const { folder_id } = req.query;
    const companyId = req.user?.company_id;

    const files = await driveService.getFilesService(folder_id, companyId, req.user);
    return successResponse(res, keysToCamelCase(await withPermissions(req, files)), "Files fetched successfully.");
  } catch (error) {
    console.error("Error fetching files:", error);
    return handleControllerError(res, error, "Failed to fetch files.");
  }
};

export const renameFile = async (req, res) => {
  try {
    const { id } = req.params;
    const { original_name } = req.body;
    const companyId = req.user?.company_id;

    if (!original_name) {
      return errorResponse(res, 400, "New file name is required.");
    }

    // The user is passed through now: the rename is recorded in the document's
    // audit history, and an entry that cannot say who made the change is not
    // worth recording.
    const updatedFile = await driveService.renameFileService(
      id,
      original_name,
      companyId,
      req.user?.users_id,
    );
    return successResponse(res, keysToCamelCase(updatedFile), "File renamed successfully.");
  } catch (error) {
    console.error("Error renaming file:", error);
    return errorResponse(res, 400, error.message);
  }
};

export const deleteFile = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.user?.company_id;

    await driveService.deleteFileService(id, companyId);
    return successResponse(res, null, "File deleted successfully.");
  } catch (error) {
    console.error("Error deleting file:", error);
    return errorResponse(res, 400, error.message);
  }
};
export const downloadFile = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.user?.company_id;

    // The same object serves two actions. Download asks for "attachment" so the
    // browser saves it; the viewer asks for nothing and gets an inline link it
    // can fetch and render in the app. Anything else is treated as inline —
    // showing a file is the safer of the two to get wrong.
    const disposition = req.query?.disposition === "attachment" ? "attachment" : "inline";

    const downloadUrl = await driveService.getDownloadUrlService(id, companyId, { disposition });
    return successResponse(res, keysToCamelCase({ url: downloadUrl }), "Download URL generated successfully.", 200);
  } catch (error) {
    console.error("Error downloading file:", error);
    return errorResponse(res, 400, error.message);
  }
};

export const moveFile = async (req, res) => {
  try {
    const { id } = req.params;
    const { new_folder_id } = req.body;
    const companyId = req.user?.company_id;
    const userId = req.user?.users_id;

    // `req.user` goes through so the service can check the destination too: the
    // route's canEdit answers only for the file, and filing it somewhere is a
    // write to that folder as well.
    const file = await driveService.moveFileService(id, new_folder_id, companyId, userId, req.user);
    return successResponse(res, keysToCamelCase(file), "File moved successfully.", 200);
  } catch (error) {
    console.error("Error moving file:", error);
    return errorResponse(res, 400, error.message);
  }
};

export const moveFolder = async (req, res) => {
  try {
    const { id } = req.params;
    const { new_parent_id } = req.body;
    const companyId = req.user?.company_id;
    const userId = req.user?.users_id;

    // `req.user` goes through for the destination check: the route's canEdit
    // answers only for the folder being moved, and filing it under another is a
    // write to that one as well.
    const folder = await driveService.moveFolderService(id, new_parent_id, companyId, userId, req.user);
    return successResponse(res, keysToCamelCase(folder), "Folder moved successfully.", 200);
  } catch (error) {
    console.error("Error moving folder:", error);
    return errorResponse(res, 400, error.message);
  }
};

export const searchDrive = async (req, res) => {
  try {
    const { q } = req.query;
    const companyId = req.user?.company_id;

    if (!q) {
      return errorResponse(res, 400, "Search query 'q' is required.");
    }

    const results = await driveService.searchDriveService(q, companyId, req.user);
    results.items = await withPermissions(req, results.items);
    return successResponse(res, keysToCamelCase(results), "Search results fetched successfully.", 200);
  } catch (error) {
    console.error("Error searching drive:", error);
    return errorResponse(res, 400, error.message);
  }
};

export const getTrash = async (req, res) => {
  try {
    const results = await driveService.getTrashService(req.user?.company_id, req.user);
    results.items = await withPermissions(req, results.items);
    return successResponse(res, keysToCamelCase(results), "Trash items fetched.", 200);
  } catch (error) {
    return errorResponse(res, 400, error.message);
  }
};

/**
 * Restoring also empties the item's Manage Access list, so the message says so
 * — otherwise the sharing silently disappears and reads as a bug.
 */
const restoredMessage = (label, sharesCleared) =>
  sharesCleared > 0
    ? `${label} restored. ${sharesCleared} previous access ${sharesCleared === 1 ? "entry was" : "entries were"} cleared — share it again to give access back.`
    : `${label} restored.`;

export const restoreFolder = async (req, res) => {
  try {
    const { item, sharesCleared } = await driveService.restoreFolderService(req.params.id, req.user?.company_id, req.user?.users_id);
    return successResponse(res, keysToCamelCase(item), restoredMessage("Folder", sharesCleared), 200);
  } catch (error) {
    return errorResponse(res, 400, error.message);
  }
};

export const restoreFile = async (req, res) => {
  try {
    const { item, sharesCleared } = await driveService.restoreFileService(req.params.id, req.user?.company_id, req.user?.users_id);
    return successResponse(res, keysToCamelCase(item), restoredMessage("File", sharesCleared), 200);
  } catch (error) {
    console.error("Error restoring file:", error);
    return errorResponse(res, 400, error.message);
  }
};

export const emptyTrash = async (req, res) => {
  try {
    await driveService.emptyTrashService(req.user?.company_id, req.user?.users_id);
    return successResponse(res, null, "Trash emptied.", 200);
  } catch (error) {
    return errorResponse(res, 400, error.message);
  }
};

export const toggleStarFolder = async (req, res) => {
  try {
    const folder = await driveService.toggleStarFolderService(req.params.id, req.user?.company_id);
    return successResponse(res, keysToCamelCase(folder), "Folder star toggled.", 200);
  } catch (error) {
    return errorResponse(res, 400, error.message);
  }
};

export const toggleStarFile = async (req, res) => {
  try {
    const file = await driveService.toggleStarFileService(req.params.id, req.user?.company_id);
    return successResponse(res, keysToCamelCase(file), "File star toggled.", 200);
  } catch (error) {
    return errorResponse(res, 400, error.message);
  }
};

export const getStarred = async (req, res) => {
  try {
    const results = await driveService.getStarredService(req.user?.company_id, req.user);
    results.items = await withPermissions(req, results.items);
    return successResponse(res, keysToCamelCase(results), "Starred items fetched.", 200);
  } catch (error) {
    return errorResponse(res, 400, error.message);
  }
};

export const getRecentFiles = async (req, res) => {
  try {
    const results = await driveService.getRecentFilesService(req.user?.company_id, req.user);
    results.items = await withPermissions(req, results.items);
    return successResponse(res, keysToCamelCase(results), "Recent files fetched.", 200);
  } catch (error) {
    return errorResponse(res, 400, error.message);
  }
};

export const getStorageStats = async (req, res) => {
  try {
    const stats = await driveService.getStorageStatsService(req.user?.company_id, req.user);
    return successResponse(res, keysToCamelCase(stats), "Storage stats fetched.", 200);
  } catch (error) {
    return errorResponse(res, 400, error.message);
  }
};

export const getFolderBreadcrumbs = async (req, res) => {
  try {
    const breadcrumbs = await driveService.getFolderBreadcrumbsService(req.params.id, req.user?.company_id, req.user);
    return successResponse(res, keysToCamelCase(breadcrumbs), "Breadcrumbs fetched.", 200);
  } catch (error) {
    return errorResponse(res, 400, error.message);
  }
};

// --- Stage C2: Reorder ---
export const reorderItems = async (req, res) => {
  try {
    const { items, parent_id } = req.body;
    const companyId = req.user?.company_id;
    if (!items || !Array.isArray(items)) {
      return errorResponse(res, 400, "'items' array is required.");
    }
    const result = await reorderItemsService(items, parent_id, companyId);
    return successResponse(res, keysToCamelCase(result), "Items reordered.", 200);
  } catch (error) {
    console.error("[Reorder] Error:", error);
    return errorResponse(res, 400, error.message);
  }
};

// --- Stage C3: Thumbnail ---
export const getFileThumbnail = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.user?.company_id;
    const result = await getThumbnailUrlService(id, companyId);
    return successResponse(res, keysToCamelCase(result), "Thumbnail URL fetched.", 200);
  } catch (error) {
    console.error("[Thumbnail] Error:", error);
    return errorResponse(res, 400, error.message);
  }
};
