import express from "express";
import multer from "multer";
import {
  convertOpportunityToJob,
  getAllJobs,
  getJobById,
  getMyJobs,
  getMyJobById,
  getMyJobColours,
  saveMyJobColours,
  updateJobStatus,
  updatePreconstClose,
  assignJobBuilder,
  getColorSelections,
  saveColorSelections,
  getMyColours,
  saveMyColours,
  approveColorSelection,
  resetJobColors,
  getColorReport,
  getColorDocumentItems,
  generateColorDocument,
  getColorDocument,
  getJobDocuments,
  createJobDocumentFolder,
  uploadJobDocument,
  getJobActivityLog,
  getCommencementLetterPreview,
  sendCommencementLetter,
  getCommencementLetterPublicDetails,
  acknowledgeCommencementLetter,
  getCompletionApproval,
  sendCompletionApproval,
  getCompletionApprovalPublicDetails,
  respondCompletionApproval,
} from "./job.controller.js";
import { handleMulterError } from "../../utils/s3Upload.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import {
  scopeBuilder,
  requirePermission,
  MODULES,
  ACTIONS,
} from "../../middleware/rbac/index.js";
import { validateExternalToken } from "../../middleware/externalAuthMiddleware.js";
import {
  convertOpportunitySchema,
  commencementLetterParamsSchema,
  sendCommencementLetterBodySchema,
  acknowledgeCommencementLetterBodySchema,
  completionApprovalParamsSchema,
  sendCompletionApprovalBodySchema,
  respondCompletionApprovalBodySchema,
  assignBuilderParamsSchema,
  assignBuilderBodySchema,
  getJobActivityLogParamsSchema,
  getJobActivityLogQuerySchema,
  myColoursBodySchema,
  myJobTrackingParamsSchema,
  myJobColourSaveSchema,
} from "./job.validation.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

const router = express.Router();

// In-memory multer for job document uploads (buffer streamed straight to S3).
// Allowed: PDF, Excel, images and video — nothing else.
const JOB_DOC_EXACT_MIMES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls
]);

const upload = multer({
  storage: multer.memoryStorage(),
  // 50MB so video is usable; handleMulterError reports this limit accurately.
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const mime = (file.mimetype || "").toLowerCase();
    // image/* and video/* cover the long tail of camera + codec subtypes.
    // SVG is excluded deliberately: a stored SVG can carry script.
    const allowed =
      JOB_DOC_EXACT_MIMES.has(mime) ||
      (mime.startsWith("image/") && mime !== "image/svg+xml") ||
      mime.startsWith("video/");

    if (allowed) return cb(null, true);
    // Must start with "Invalid file type" for handleMulterError to return 400.
    cb(new Error("Invalid file type. Only PDF, Excel, image and video files are allowed."), false);
  },
});

// ── PUBLIC routes (customer acknowledgment via the emailed link) ──────────────
// Registered BEFORE auth middleware. External customers have no JWT — these are
// secured by validateExternalToken (encrypted, time-sensitive token), mirroring
// the structural-engineer external upload routes.
router.get(
  "/:job_id/commencement-letter/public-details",
  validateExternalToken,
  validateRequest(commencementLetterParamsSchema, REQUEST_SOURCE.PARAMS),
  getCommencementLetterPublicDetails,
);

router.post(
  "/:job_id/commencement-letter/acknowledge",
  validateExternalToken,
  validateRequest(commencementLetterParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(acknowledgeCommencementLetterBodySchema, REQUEST_SOURCE.BODY),
  acknowledgeCommencementLetter,
);

router.get(
  "/:job_id/completion-approval/public-details",
  validateExternalToken,
  validateRequest(completionApprovalParamsSchema, REQUEST_SOURCE.PARAMS),
  getCompletionApprovalPublicDetails,
);

router.post(
  "/:job_id/completion-approval/respond",
  validateExternalToken,
  validateRequest(completionApprovalParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(respondCompletionApprovalBodySchema, REQUEST_SOURCE.BODY),
  respondCompletionApproval,
);

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(scopeBuilder);

// ── Contact self-service — "track my build" ──────────────────────────────────
// The jobs the logged-in user is the homebuyer on (job.customer_contact_id).
// Deliberately NOT guarded by requirePermission(JOB): the Contact role has no
// JOB permission, yet must be able to follow its own build. The service
// constrains every row to customer_contact_id = self, so exposure is limited to
// the caller's own job regardless of role, and the payload is a curated
// customer-facing subset rather than the builder's view returned by
// GET /job/:job_id. Declared before "/" and "/:job_id" so the literal
// "/my/tracking" paths win over the :job_id param route.
// router.get("/my/tracking", getMyJobs);
// 
// router.get(
//   "/my/tracking/:job_id",
//   validateRequest(myJobTrackingParamsSchema, REQUEST_SOURCE.PARAMS),
//   getMyJobById,
// );

// The Colour stage is the customer's own step of the build, so it is the one
// part of the tracker they can act on. Reading returns the job's cloned colour
// items grouped by category; writing replaces their picks and is refused once
// the consultant has approved the schedule. Approving stays on
// PATCH /job/:job_id/color/approve, which this role cannot reach.
//
// The read is deliberately not permission-gated — the service constrains every
// row to customer_contact_id = self, and a homebuyer following their own build
// is the whole point of the page. Writing is a different question: a role given
// only READ on Colour Selection must be able to look at the schedule without
// being able to change it or send it to the builder, so the save carries the
// same UPDATE gate as every other colour write. GET reports the outcome as
// `canEdit` so the page renders read-only instead of offering a button that
// 403s.
router.get(
  "/my/tracking/colours",
  getMyJobColours,
);

router.put(
  "/my/tracking/colours",
  requirePermission(MODULES.COLOR_SELECTION, ACTIONS.UPDATE),
  camelToSnakeMiddleware,
  validateRequest(myJobColourSaveSchema, REQUEST_SOURCE.BODY),
  saveMyJobColours,
);

// GET /job — list all jobs with pagination, filtering, sorting
router.get("/", requirePermission(MODULES.JOB, ACTIONS.READ), getAllJobs);

// ── My Colours — the homebuyer's own colour stage ────────────────────────────
// Registered ahead of "/:job_id" so the literal path always wins, and taking no
// job id at all: the job is resolved from the signed-in Contact, which is what
// stops a customer reading or writing anybody else's colours. READ to look,
// UPDATE to change — the GET reports which of the two the caller has as
// `canEdit`, so the page never offers a button that would come back 403.
router.get(
  "/my/tracking/colours",
  requirePermission(MODULES.COLOR_SELECTION, ACTIONS.READ),
  getMyColours,
);

router.put(
  "/my/tracking/colours",
  requirePermission(MODULES.COLOR_SELECTION, ACTIONS.UPDATE),
  camelToSnakeMiddleware,
  validateRequest(myColoursBodySchema, REQUEST_SOURCE.BODY),
  saveMyColours,
);

// GET /job/:job_id — fetch full detail of a single job
router.get("/:job_id", requirePermission(MODULES.JOB, ACTIONS.READ), getJobById);

// GET /job/:job_id/activity-log — paginated audit trail for a job
router.get(
  "/:job_id/activity-log", 
  validateRequest(getJobActivityLogParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(getJobActivityLogQuerySchema, REQUEST_SOURCE.QUERY),
  getJobActivityLog
);

// GET /job/:job_id/documents — read-only aggregated document tree for a job
// (mirrors GET /leads/:leads_id/documents).
router.get(
  "/:job_id/documents",
  requirePermission(MODULES.JOB, ACTIONS.READ),
  getJobDocuments,
);

// POST /job/:job_id/documents/folders — create a user folder in the job tree
router.post(
  "/:job_id/documents/folders",
  requirePermission(MODULES.JOB, ACTIONS.UPDATE),
  camelToSnakeMiddleware,
  createJobDocumentFolder,
);

// POST /job/:job_id/documents/files — upload a file into the job tree
// (multer parses the multipart body first, then camelToSnake maps folderId).
router.post(
  "/:job_id/documents/files",
  requirePermission(MODULES.JOB, ACTIONS.UPDATE),
  upload.single("file"),
  handleMulterError, // rejected type / oversize -> clean 400 instead of a 500
  camelToSnakeMiddleware,
  uploadJobDocument,
);

// POST /job/opportunity/:opportunity_id/convert — convert opportunity to job
router.post(
  "/opportunity/:opportunity_id/convert",
  requirePermission(MODULES.JOB, ACTIONS.CREATE),
  camelToSnakeMiddleware,
  validateRequest(convertOpportunitySchema.params, REQUEST_SOURCE.PARAMS),
  validateRequest(convertOpportunitySchema.body, REQUEST_SOURCE.BODY),
  convertOpportunityToJob,
);

// PATCH /job/:job_id/status — update job status
router.patch(
  "/:job_id/status",
  requirePermission(MODULES.JOB, ACTIONS.UPDATE),
  camelToSnakeMiddleware,
  updateJobStatus,
);

// PATCH /job/:job_id/preconstruction-close — set or clear preconstruction closed date
router.patch(
  "/:job_id/preconstruction-close",
  camelToSnakeMiddleware,
  updatePreconstClose,
);

// PATCH /job/:job_id/builder — reassign the builder firm that owns the job
router.patch(
  "/:job_id/builder",
  camelToSnakeMiddleware,
  validateRequest(assignBuilderParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(assignBuilderBodySchema, REQUEST_SOURCE.BODY),
  assignJobBuilder,
);

// GET /job/:job_id/color/selections — fetch saved colour item IDs for a job
router.get("/:job_id/color/selections", getColorSelections);

// PUT /job/:job_id/color/selections — replace colour item IDs for a job
//
// Gated on the same UPDATE permission as the customer's own save. Without it a
// Contact holding READ-only Colour Selection simply called this route with their
// own job id instead — _findJobForColorAccess lets them reach their own job by
// design — and the read-only grid meant nothing. Approve and reset refuse the
// Contact role outright in the service; this one is a write the role may hold,
// so it is the permission that decides.
router.put(
  "/:job_id/color/selections",
  requirePermission(MODULES.COLOR_SELECTION, ACTIONS.UPDATE),
  camelToSnakeMiddleware,
  saveColorSelections,
);

// PATCH /job/:job_id/color/approve — approve or revoke colour selection
router.patch("/:job_id/color/approve", camelToSnakeMiddleware, approveColorSelection);

// DELETE /job/:job_id/color/reset — clear selections and reset color tables to template
router.delete("/:job_id/color/reset", camelToSnakeMiddleware, resetJobColors);

// GET /job/:job_id/color/report — presigned URL for the stored colour-selection PDF
router.get("/:job_id/color/report", getColorReport);

// GET /job/:job_id/color/document-items — all job colour items for the document page
router.get("/:job_id/color/document-items", getColorDocumentItems);

// GET /job/:job_id/color/document — presigned URL for the stored Colour Schedule document
router.get("/:job_id/color/document", getColorDocument);

// POST /job/:job_id/color/document — generate + store the Colour Schedule document PDF
router.post("/:job_id/color/document", camelToSnakeMiddleware, generateColorDocument);

// GET /job/:job_id/commencement-letter/preview — recipient options + defaults
router.get(
  "/:job_id/commencement-letter/preview",
  validateRequest(commencementLetterParamsSchema, REQUEST_SOURCE.PARAMS),
  getCommencementLetterPreview,
);

// POST /job/:job_id/commencement-letter/send — send the Commencement Letter email
router.post(
  "/:job_id/commencement-letter/send",
  validateRequest(commencementLetterParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(sendCommencementLetterBodySchema, REQUEST_SOURCE.BODY),
  sendCommencementLetter,
);

// GET /job/:job_id/completion-approval — approval state + eligible approvers
router.get(
  "/:job_id/completion-approval",
  requirePermission(MODULES.JOB, ACTIONS.READ),
  validateRequest(completionApprovalParamsSchema, REQUEST_SOURCE.PARAMS),
  getCompletionApproval,
);

// POST /job/:job_id/completion-approval/send — email the approval request
router.post(
  "/:job_id/completion-approval/send",
  requirePermission(MODULES.JOB, ACTIONS.UPDATE),
  camelToSnakeMiddleware,
  validateRequest(completionApprovalParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(sendCompletionApprovalBodySchema, REQUEST_SOURCE.BODY),
  sendCompletionApproval,
);

export default router;
