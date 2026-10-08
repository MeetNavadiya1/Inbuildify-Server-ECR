import express from "express";
import multer from "multer";
import {
  createDocumentFolder,
  uploadDocument,
  getDocuments,
  getAllDocuments,
  getDocumentUsers,
  getFilterOptions,
  getMyDocuments,
  getMyDocumentViewUrl,
} from "./documents.controller.js";
import requireEntityPermission from "./documents.permission.js";
import {
  createDocumentFolderSchema,
  uploadDocumentSchema,
  getDocumentsSchema,
  getAllDocumentsSchema,
  getDocumentUsersSchema,
  getFilterOptionsSchema,
  getMyDocumentsSchema,
  myDocumentParamsSchema,
  myDocumentViewQuerySchema,
} from "./documents.validation.js";
import { handleMulterError } from "../../utils/s3Upload.js";
import { documentStoreFileFilter } from "../../utils/uploadFileTypes.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import {
  scopeBuilder,
  requirePermission,
  denyRoles,
  ROLES,
  MODULES,
  ACTIONS,
} from "../../middleware/rbac/index.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

const router = express.Router();

// In-memory multer for document uploads (buffer streamed straight to S3). The
// allow-list is shared with the Drive module — see utils/uploadFileTypes.js — so
// the two agree on what a storable file is, and so a file arriving as
// application/octet-stream is judged on its extension.
//
// PDFs, .docx, .xlsx/.xlsm and images only: everything here is meant to be a
// document somebody can open in the app.
const upload = multer({
  storage: multer.memoryStorage(),
  // 50MB; handleMulterError reports this limit accurately.
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: documentStoreFileFilter,
});

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(scopeBuilder);

// ── Client (Contact) dashboard ───────────────────────────────────────────────
// Read-only, and always about the caller: the service resolves "my documents"
// from the Contact's own lead/job links, so there is no id to swap. Registered
// before the staff routes and the Contact deny-list below.
const contactOnly = [
  roleMiddleware([ROLES.CONTACT]),
  requirePermission(MODULES.DOCUMENT, ACTIONS.READ),
];

// GET /documents/my — paginated list of the Contact's own documents.
router.get(
  "/my",
  ...contactOnly,
  validateRequest(getMyDocumentsSchema, REQUEST_SOURCE.QUERY),
  getMyDocuments,
);

// GET /documents/my/:fileId/view — presigned link for one of their documents.
router.get(
  "/my/:fileId/view",
  ...contactOnly,
  validateRequest(myDocumentParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(myDocumentViewQuerySchema, REQUEST_SOURCE.QUERY),
  getMyDocumentViewUrl,
);

// Everything below is staff tooling and tenant-wide (all leads, jobs, customers
// and the global drive), so a Contact is turned away even though their role
// holds DOCUMENT read for their own files — that is what /my is for.
router.use(denyRoles(ROLES.CONTACT));

// GET /documents/all — one consolidated, flat list of every document the caller
// can access (tenant-scoped), across all jobs / leads / the drive. Registered
// before "/" so the literal path wins; spans modules, so it is gated by auth +
// role + tenant scope only (no single-module permission).
router.get(
  "/all",
  validateRequest(getAllDocumentsSchema, REQUEST_SOURCE.QUERY),
  getAllDocuments,
);

// GET /documents/filter-options — dropdown data for the filter bar. Literal path,
// registered before "/"; tenant-scoped like /all.
router.get(
  "/filter-options",
  validateRequest(getFilterOptionsSchema, REQUEST_SOURCE.QUERY),
  getFilterOptions,
);

// GET /documents/users — the users a documents browser can be pointed at. Also
// registered before "/" so the literal path wins; tenant-scoped like /all.
router.get(
  "/users",
  validateRequest(getDocumentUsersSchema, REQUEST_SOURCE.QUERY),
  getDocumentUsers,
);

// GET /documents?entityType=&entityId= — read an entity's document tree.
router.get(
  "/",
  requireEntityPermission("read"),
  validateRequest(getDocumentsSchema, REQUEST_SOURCE.QUERY),
  getDocuments,
);

// POST /documents/folders — create a folder for job | lead | sdrive.
// (camelToSnake maps entityType/entityId/parentId before the guard reads them.)
router.post(
  "/folders",
  camelToSnakeMiddleware,
  requireEntityPermission("folder"),
  validateRequest(createDocumentFolderSchema, REQUEST_SOURCE.BODY),
  createDocumentFolder,
);

// POST /documents/files — upload a file for job | lead | sdrive.
// Multer parses the multipart body first, then camelToSnake maps the text
// fields, then the guard (which needs entityType) and validation run.
router.post(
  "/files",
  upload.single("file"),
  handleMulterError, // rejected type / oversize -> clean 400 instead of a 500
  camelToSnakeMiddleware,
  requireEntityPermission("upload"),
  validateRequest(uploadDocumentSchema, REQUEST_SOURCE.BODY),
  uploadDocument,
);

export default router;
