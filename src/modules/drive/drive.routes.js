import { Router } from "express";
import * as driveController from "./drive.controller.js";
import * as shareController from "./drive-share.controller.js";
import * as versionController from "./drive-version.controller.js";
import * as workspaceController from "./drive-workspace.controller.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import baseRoleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";
import {
  createFolderSchema,
  renameFolderSchema,
  renameFileSchema,
  uploadFileSchema,
  moveFileSchema,
  moveFolderSchema,
  getFilesSchema,
  syncDocumentNamesSchema,
} from "./drive.validation.js";
import { createShareSchema, createBulkShareSchema, updateShareSchema } from "./drive-share.validation.js";
import * as deleteRequestController from "./drive-delete-request.controller.js";
import {
  createDeleteRequestSchema,
  deleteRequestParamsSchema,
  respondDeleteRequestSchema,
  deleteRequestQuerySchema,
} from "./drive-delete-request.validation.js";
import { validateExternalToken } from "../../middleware/externalAuthMiddleware.js";
import { canView, canEdit, canAdmin, requireItemOwner } from "./drive.permissions.js";
import {
  syncDocumentNamesController,
  getDocumentSyncScopes,
  requireDocumentScopePermission,
} from "./drive-name-sync.controller.js";
import { scopeBuilder, denyRoles, ROLES } from "../../middleware/rbac/index.js";
import { documentStoreFileFilter } from "../../utils/uploadFileTypes.js";
import { handleMulterError } from "../../utils/s3Upload.js";
import multer from "multer";

const router = Router();

// The Drive is staff tooling: its scope treats every non-admin role as "the
// whole builder", so a Contact must never reach it — customers read their own
// files through GET /documents/my instead. Auth is applied per route here (the
// delete-request responses use an external token), so the deny-list rides on
// the role check that follows authMiddleware on every authenticated route.
const denyContact = denyRoles(ROLES.CONTACT);
const roleMiddleware = (req, res, next) =>
  baseRoleMiddleware(req, res, () => denyContact(req, res, next));

// The allow-list lives in utils/uploadFileTypes.js so the Drive and the
// Documents module agree on what a storable file is, and so a type sent as
// application/octet-stream (curl, and Windows for extensions with no
// association) is judged on its extension instead of being rejected outright.
//
// `documentStoreFileFilter`, not the general one: this is a store of documents
// the app opens, so it takes PDFs, .docx, .xlsx/.xlsm and images and nothing
// else. This is the check that matters — the client's `accept` attribute is a
// convenience for the file picker and is trivially bypassed.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB, matching the Documents module
  fileFilter: documentStoreFileFilter,
});

// -----------------------------------------------------------------
// Workspace — the role-aware S Drive shape.
//
// /workspace tells the client which structure to render; the my-leads /
// my-jobs / shared-documents lists back the simplified Builder view. Each is
// scoped to the caller server-side, so these are safe for any authenticated
// user — a Company Admin calling them simply gets their whole company.
// Declared before "/:type(folders|files)/..." so the literal paths win.
// -----------------------------------------------------------------
router.get("/workspace", authMiddleware, roleMiddleware, workspaceController.getWorkspace);
router.get("/my-leads", authMiddleware, roleMiddleware, workspaceController.getMyLeads);
router.get("/my-jobs", authMiddleware, roleMiddleware, workspaceController.getMyJobs);
router.get("/shared-documents", authMiddleware, roleMiddleware, workspaceController.getSharedDocuments);
router.get("/workspace/:type(lead|job)/:id/documents", authMiddleware, roleMiddleware, workspaceController.getEntityDocuments);

// -----------------------------------------------------------------
// Global Drive Queries (no entity-level permission needed)
// -----------------------------------------------------------------
router.get("/search", authMiddleware, roleMiddleware, driveController.searchDrive);
router.get("/trash", authMiddleware, roleMiddleware, driveController.getTrash);
router.delete("/trash/empty", authMiddleware, roleMiddleware, driveController.emptyTrash);
router.get("/starred", authMiddleware, roleMiddleware, driveController.getStarred);
router.get("/recent", authMiddleware, roleMiddleware, driveController.getRecentFiles);
router.get("/stats", authMiddleware, roleMiddleware, driveController.getStorageStats);

// -----------------------------------------------------------------
// Document name sync — one endpoint for every entity that owns documents
// (lead, job, …). Re-names stored files to the format configured under
// Admin → Document → File Naming. The permission checked depends on the
// scope in the body, so scopeBuilder must run to resolve the role first.
// -----------------------------------------------------------------
router.get("/documents/sync-names/scopes", authMiddleware, roleMiddleware, getDocumentSyncScopes);
router.post(
  "/documents/sync-names",
  authMiddleware,
  roleMiddleware,
  camelToSnakeMiddleware,
  validateRequest(syncDocumentNamesSchema, REQUEST_SOURCE.BODY),
  scopeBuilder,
  requireDocumentScopePermission,
  syncDocumentNamesController,
);

// -----------------------------------------------------------------
// Sharing & Permissions (Stage B)
// -----------------------------------------------------------------
router.post("/share", authMiddleware, roleMiddleware, camelToSnakeMiddleware, validateRequest(createShareSchema, REQUEST_SOURCE.BODY), shareController.createShare);
// Multi-user share — what the Share popup posts.
router.post("/share/bulk", authMiddleware, roleMiddleware, camelToSnakeMiddleware, validateRequest(createBulkShareSchema, REQUEST_SOURCE.BODY), shareController.createBulkShare);
router.put("/share/:id", authMiddleware, roleMiddleware, camelToSnakeMiddleware, validateRequest(updateShareSchema, REQUEST_SOURCE.BODY), shareController.updateShare);
router.delete("/share/:id", authMiddleware, roleMiddleware, shareController.deleteShare);
router.get("/shared-with-me", authMiddleware, roleMiddleware, shareController.getSharedWithMe);
// Who the item is shared with — the Manage Access list. Readable by anyone who
// can open the item; canView also rejects an id lifted from another company.
// Changing anything on that list still needs ADMIN, enforced in the service.
router.get("/:type(folders|files)/:id/shares", authMiddleware, roleMiddleware, canView, shareController.getEntityShares);

// -----------------------------------------------------------------
// Delete approval — a shared item is deleted only if its owner says so.
//
// Someone shared at EDIT or ADMIN raises the request; the owner is emailed a
// link and decides from it, with no session, so the two response routes are
// guarded by the external token plus the per-request token in the link rather
// than by authMiddleware. See drive-delete-request.service.js.
// -----------------------------------------------------------------
router.post(
  "/delete-requests",
  authMiddleware,
  roleMiddleware,
  camelToSnakeMiddleware,
  validateRequest(createDeleteRequestSchema, REQUEST_SOURCE.BODY),
  deleteRequestController.createDeleteRequest,
);
router.get(
  "/delete-requests/:request_id/public-details",
  validateExternalToken,
  validateRequest(deleteRequestParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(deleteRequestQuerySchema, REQUEST_SOURCE.QUERY),
  deleteRequestController.getDeleteRequestPublicDetails,
);
router.post(
  "/delete-requests/:request_id/respond",
  validateExternalToken,
  camelToSnakeMiddleware,
  validateRequest(deleteRequestParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(respondDeleteRequestSchema, REQUEST_SOURCE.BODY),
  deleteRequestController.respondDeleteRequest,
);

// -----------------------------------------------------------------
// Folder Routes — permission guards applied to mutating operations
// -----------------------------------------------------------------
router.get("/folders", authMiddleware, roleMiddleware, driveController.getRootFolders);
router.post("/folders", authMiddleware, roleMiddleware, camelToSnakeMiddleware, validateRequest(createFolderSchema, REQUEST_SOURCE.BODY), driveController.createFolder);
// Where a document may be moved to — the user-created folders the caller can
// write into. A literal path, so it is declared before "/folders/:id" or that
// route would read "move-targets" as a folder id.
router.get("/folders/move-targets", authMiddleware, roleMiddleware, driveController.getMoveTargetFolders);
router.get("/folders/:id", authMiddleware, roleMiddleware, canView, driveController.getFolderContents);
router.get("/folders/:id/breadcrumbs", authMiddleware, roleMiddleware, canView, driveController.getFolderBreadcrumbs);
router.put("/folders/:id", authMiddleware, roleMiddleware, canEdit, camelToSnakeMiddleware, validateRequest(renameFolderSchema, REQUEST_SOURCE.BODY), driveController.renameFolder);
// Delete is an EDIT action: a user the item was shared with at EDIT can send it
// to Trash, which is what the Manage Access popup promises for that level.
router.delete("/folders/:id", authMiddleware, roleMiddleware, canEdit, driveController.deleteFolder);
router.put("/folders/:id/move", authMiddleware, roleMiddleware, canEdit, camelToSnakeMiddleware, validateRequest(moveFolderSchema, REQUEST_SOURCE.BODY), driveController.moveFolder);
// Restoring is the owner's alone — not an EDIT action like the delete that put
// it there. A shared item sits in the owner's Trash and nobody else's, and
// bringing it back wipes its access list, so a share holder must not be able to
// trigger it from an id. requireItemOwner reads trashed rows (paranoid: false).
router.put("/folders/:id/restore", authMiddleware, roleMiddleware, requireItemOwner, driveController.restoreFolder);
router.put("/folders/:id/star", authMiddleware, roleMiddleware, canView, driveController.toggleStarFolder);

// -----------------------------------------------------------------
// File Routes — permission guards applied to mutating operations
// -----------------------------------------------------------------
// handleMulterError sits directly after the upload so a rejected type or an
// oversized file answers 400 with the reason; without it Multer's error fell
// through to the generic handler and the client saw a bare 500.
router.post("/files/upload", authMiddleware, roleMiddleware, upload.single("file"), handleMulterError, camelToSnakeMiddleware, validateRequest(uploadFileSchema, REQUEST_SOURCE.BODY), driveController.uploadFile);
router.get("/files", authMiddleware, roleMiddleware, camelToSnakeMiddleware, validateRequest(getFilesSchema, REQUEST_SOURCE.QUERY), driveController.getFilesInFolder);
router.put("/files/:id", authMiddleware, roleMiddleware, canEdit, camelToSnakeMiddleware, validateRequest(renameFileSchema, REQUEST_SOURCE.BODY), driveController.renameFile);
router.delete("/files/:id", authMiddleware, roleMiddleware, canEdit, driveController.deleteFile);
router.get("/files/:id/download", authMiddleware, roleMiddleware, canView, driveController.downloadFile);
router.put("/files/:id/move", authMiddleware, roleMiddleware, canEdit, camelToSnakeMiddleware, validateRequest(moveFileSchema, REQUEST_SOURCE.BODY), driveController.moveFile);
// Owner only — see the folder restore above.
router.put("/files/:id/restore", authMiddleware, roleMiddleware, requireItemOwner, driveController.restoreFile);
router.put("/files/:id/star", authMiddleware, roleMiddleware, canView, driveController.toggleStarFile);

// -----------------------------------------------------------------
// File Version Routes (Stage C1)
// -----------------------------------------------------------------
router.post("/files/:id/versions", authMiddleware, roleMiddleware, canEdit, upload.single("file"), handleMulterError, versionController.uploadNewVersion);
// Convert a pre-2007 .doc/.xls to .docx/.xlsx in place so the editor can open
// it. A write, so it takes canEdit and the administrator's editing switch; the
// original binary is retained as a version.
router.post("/files/:id/convert-legacy", authMiddleware, roleMiddleware, canEdit, versionController.convertLegacyDocument);
router.get("/files/:id/versions", authMiddleware, roleMiddleware, canView, versionController.getFileVersions);
router.get("/files/:id/versions/:versionId/download", authMiddleware, roleMiddleware, canView, versionController.getVersionDownloadUrl);
router.put("/files/:id/versions/:versionId/restore", authMiddleware, roleMiddleware, canEdit, versionController.restoreVersion);
router.delete("/files/:id/versions/:versionId", authMiddleware, roleMiddleware, canAdmin, versionController.deleteVersion);

// -----------------------------------------------------------------
// Reorder Route (Stage C2) — parent-folder scoped
// -----------------------------------------------------------------
router.put("/reorder", authMiddleware, roleMiddleware, camelToSnakeMiddleware, driveController.reorderItems);

// -----------------------------------------------------------------
// Thumbnail Route (Stage C3)
// -----------------------------------------------------------------
router.get("/files/:id/thumbnail", authMiddleware, roleMiddleware, canView, driveController.getFileThumbnail);

export default router;
