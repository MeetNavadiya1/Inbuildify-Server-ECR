import jobService from "./job.service.js";
import myColoursService from "./my-colours.service.js";
import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";

// ──────────────────────────────────────────────────────────────────────────────
//  GET /job  — paginated, filtered, sorted job list
// ──────────────────────────────────────────────────────────────────────────────
export async function getAllJobs(req, res) {
  try {
    const result = await jobService.getAllJobs(req.query, req.user);

    if (!result.success) {
      return errorResponse(res, result.statusCode || 400, result.message);
    }

    return successResponse(res, result.data, "Jobs fetched successfully");
  } catch (error) {
    console.error("getAllJobs error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

// ──────────────────────────────────────────────────────────────────────────────
//  GET /job/:job_id  — full detail of a single job
// ──────────────────────────────────────────────────────────────────────────────
export async function getJobById(req, res) {
  try {
    const { job_id } = req.params;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(job_id)) {
      return errorResponse(res, 400, "Invalid Job ID format");
    }

    const result = await jobService.getJobById(job_id, req.user);

    if (!result.success) {
      return errorResponse(res, result.statusCode || 404, result.message);
    }

    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("getJobById error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

// ──────────────────────────────────────────────────────────────────────────────
//  GET /job/my/tracking — the jobs the caller is the homebuyer on
//
//  Self-scoped in the service (job.customer_contact_id = self), so it needs no
//  JOB permission: it is the Contact role's window onto its own build.
// ──────────────────────────────────────────────────────────────────────────────
export async function getMyJobs(req, res) {
  try {
    const result = await jobService.getMyContactJobs(req.user);

    if (!result.success) {
      return errorResponse(res, result.statusCode || 400, result.message);
    }

    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("getMyJobs error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

// ──────────────────────────────────────────────────────────────────────────────
//  GET /job/my/tracking/:job_id — build tracker for one of the caller's own jobs
//
//  Returns 404 for a job the caller is not the mapped contact on.
// ──────────────────────────────────────────────────────────────────────────────
export async function getMyJobById(req, res) {
  try {
    const { job_id } = req.params;
    const result = await jobService.getMyContactJobById(req.user, job_id);

    if (!result.success) {
      return errorResponse(res, result.statusCode || 404, result.message);
    }

    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("getMyJobById error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

// ──────────────────────────────────────────────────────────────────────────────
//  GET /job/my/tracking/:job_id/colours — the homebuyer's colour catalogue
// ──────────────────────────────────────────────────────────────────────────────
export async function getMyJobColours(req, res) {
  try {
    const result = await jobService.getMyContactJobColours(req.user);

    if (!result.success) {
      return errorResponse(res, result.statusCode || 404, result.message);
    }

    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("getMyJobColours error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

// ──────────────────────────────────────────────────────────────────────────────
//  PUT /job/my/tracking/colours — save the homebuyer's picks
//
//  Saving is not approving: 409 once the consultant has approved the schedule.
// ──────────────────────────────────────────────────────────────────────────────
export async function saveMyJobColours(req, res) {
  try {
    const result = await jobService.saveMyContactJobColours(req.user, req.body);

    if (!result.success) {
      return errorResponse(res, result.statusCode || 400, result.message);
    }

    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("saveMyJobColours error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

// ──────────────────────────────────────────────────────────────────────────────
//  POST /job/opportunity/:opportunity_id/convert
// ──────────────────────────────────────────────────────────────────────────────
export async function convertOpportunityToJob(req, res) {
  try {
    const { opportunity_id } = req.params;
    const result = await jobService.convertOpportunityToJob(opportunity_id, req.body, req.user);

    if (!result.success) {
      return errorResponse(res, result.statusCode || 400, result.message);
    }

    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("convertOpportunityToJob error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

// ──────────────────────────────────────────────────────────────────────────────
//  PATCH /job/:job_id/status
// ──────────────────────────────────────────────────────────────────────────────
export async function updateJobStatus(req, res) {
  try {
    const { job_id } = req.params;
    const { status, pci_date, occupancy_permit_date, handover_date } = req.body;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(job_id)) {
      return errorResponse(res, 400, "Invalid Job ID format");
    }

    const result = await jobService.updateJobStatus(job_id, status, req.user, {
      pciDate: pci_date,
      occupancyPermitDate: occupancy_permit_date,
      handoverDate: handover_date,
    });

    if (!result.success) {
      // Forward result.data so refusals can carry context — the stage gate
      // returns the outstanding stages for the UI to point at.
      return errorResponse(res, result.statusCode || 400, result.message, result.data);
    }

    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("updateJobStatus error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

// ──────────────────────────────────────────────────────────────────────────────
//  PATCH /job/:job_id/preconstruction-close
//  Set or clear the preconstruction closed date.
//  Body: { closedAt: "YYYY-MM-DD" | null }
// ──────────────────────────────────────────────────────────────────────────────
export async function updatePreconstClose(req, res) {
  try {
    const { job_id } = req.params;
    // Frontend sends camelCase; camelToSnakeMiddleware converts to snake_case
    const closedAt = req.body.closed_at ?? null;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(job_id)) {
      return errorResponse(res, 400, "Invalid Job ID format");
    }

    const result = await jobService.updatePreconstClose(job_id, closedAt, req.user);
    if (!result.success) {
      return errorResponse(res, result.statusCode || 400, result.message);
    }
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("updatePreconstClose error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

// ──────────────────────────────────────────────────────────────────────────────
//  PATCH /job/:job_id/builder  — reassign the builder firm that owns the job
//  Body: { builder_id }
// ──────────────────────────────────────────────────────────────────────────────
export async function assignJobBuilder(req, res) {
  try {
    const { job_id } = req.params;
    const builderId = req.body.builder_id;

    const result = await jobService.assignJobBuilder(job_id, builderId, req.user);

    if (!result.success) {
      return errorResponse(res, result.statusCode || 400, result.message);
    }

    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("assignJobBuilder error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

// ──────────────────────────────────────────────────────────────────────────────
//  Colour selections per job
// ──────────────────────────────────────────────────────────────────────────────
export async function getColorSelections(req, res) {
  try {
    const { job_id } = req.params;
    const result = await jobService.getColorSelections(job_id, req.user);
    if (!result.success) return errorResponse(res, result.statusCode || 404, result.message);
    return successResponse(res, result.data, "Colour selections fetched");
  } catch (error) {
    console.error("getColorSelections error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

// Body: { selections: [{ colorId, unit, note, pdfHighlight }] } and/or the
// legacy { itemIds: [...] }. The service normalises both shapes.
export async function saveColorSelections(req, res) {
  try {
    const { job_id } = req.params;
    const result = await jobService.saveColorSelections(job_id, req.body, req.user);
    if (!result.success) return errorResponse(res, result.statusCode || 400, result.message);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("saveColorSelections error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

// ──────────────────────────────────────────────────────────────────────────────
//  My Colours — the homebuyer's own colour stage
//
//  Neither of these takes a job id. The job is resolved from the signed-in
//  Contact, so a customer can only ever reach their own build — see
//  `resolveMyJob`. Everything else about the payload matches the builder-side
//  colour selection endpoints above.
// ──────────────────────────────────────────────────────────────────────────────

export async function getMyColours(req, res) {
  try {
    const result = await myColoursService.getMyColours(req.user);
    // 404 here means "no build linked yet", which the client renders as a
    // waiting state rather than an error.
    if (!result.success) return errorResponse(res, result.statusCode || 404, result.message);
    return successResponse(res, result.data, "Colours fetched");
  } catch (error) {
    console.error("getMyColours error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

// Body (camelCase, snake-cased by the middleware): { itemIds, selections: [{ colorId, unit }] }
export async function saveMyColours(req, res) {
  try {
    const result = await myColoursService.saveMyColours(req.user, req.body);
    if (!result.success) return errorResponse(res, result.statusCode || 400, result.message);
    return successResponse(res, result.data, result.message || "Colours saved");
  } catch (error) {
    console.error("saveMyColours error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function approveColorSelection(req, res) {
  try {
    const { job_id } = req.params;
    const approved = req.body.approved !== false;
    const result = await jobService.approveColorSelection(job_id, approved, req.user);
    if (!result.success) return errorResponse(res, result.statusCode || 400, result.message);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("approveColorSelection error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function resetJobColors(req, res) {
  try {
    const { job_id } = req.params;
    const result = await jobService.resetJobColors(job_id, req.user);
    if (!result.success) return errorResponse(res, result.statusCode || 400, result.message);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("resetJobColors error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

// GET /job/:job_id/color/report — presigned URL for the stored colour-selection
// PDF (generated on the fly if it does not exist yet).
export async function getColorReport(req, res) {
  try {
    const { job_id } = req.params;
    const result = await jobService.getColorReport(job_id, req.user);
    if (!result.success) return errorResponse(res, result.statusCode || 404, result.message);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("getColorReport error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

// GET /job/:job_id/color/document-items — all of a job's colour items for the
// "Generate Colors Document" page (category/supplier names resolved).
export async function getColorDocumentItems(req, res) {
  try {
    const { job_id } = req.params;
    const result = await jobService.getColorDocumentItems(job_id, req.user);
    if (!result.success) return errorResponse(res, result.statusCode || 404, result.message);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("getColorDocumentItems error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

// POST /job/:job_id/color/document — generate the Colour Schedule document PDF,
// store it in drive_files (overwriting the existing one), and return its URL.
export async function generateColorDocument(req, res) {
  try {
    const { job_id } = req.params;
    // Optional: only include these colour items (the rows selected on the page).
    const itemIds = Array.isArray(req.body?.item_ids) ? req.body.item_ids : [];
    const result = await jobService.generateAndStoreColorDocument(job_id, req.user, itemIds);
    if (!result.success) return errorResponse(res, result.statusCode || 400, result.message);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("generateColorDocument error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

// GET /job/:job_id/color/document — presigned URL for the stored Colour Schedule
// document PDF (generated on the fly if it does not exist yet).
export async function getColorDocument(req, res) {
  try {
    const { job_id } = req.params;
    const result = await jobService.getColorDocument(job_id, req.user);
    if (!result.success) return errorResponse(res, result.statusCode || 404, result.message);
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("getColorDocument error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

// ──────────────────────────────────────────────────────────────────────────────
//  GET /job/:job_id/documents  — read-only aggregated document tree for a job
//  (mirrors GET /leads/:leads_id/documents).
// ──────────────────────────────────────────────────────────────────────────────
export async function getJobDocuments(req, res) {
  try {
    const { job_id } = req.params;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(job_id)) {
      return errorResponse(res, 400, "Invalid Job ID format");
    }

    const result = await jobService.getJobDocuments(job_id, req.user);

    if (!result.success) {
      return errorResponse(res, result.statusCode || 404, result.message);
    }

    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("getJobDocuments error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

// ──────────────────────────────────────────────────────────────────────────────
//  POST /job/:job_id/documents/folders  — create a user folder in the job tree
// ──────────────────────────────────────────────────────────────────────────────
export async function createJobDocumentFolder(req, res) {
  try {
    const { job_id } = req.params;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(job_id)) {
      return errorResponse(res, 400, "Invalid Job ID format");
    }

    // camelToSnakeMiddleware maps folderName -> folder_name, parentId -> parent_id.
    const name = req.body.name ?? req.body.folder_name;
    const parentId = req.body.parent_id ?? req.body.parentId ?? null;

    const result = await jobService.createJobFolder(job_id, { name, parentId }, req.user);

    if (!result.success) {
      return errorResponse(res, result.statusCode || 400, result.message);
    }

    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("createJobDocumentFolder error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

// ──────────────────────────────────────────────────────────────────────────────
//  POST /job/:job_id/documents/files  — upload a file into the job tree
// ──────────────────────────────────────────────────────────────────────────────
export async function uploadJobDocument(req, res) {
  try {
    const { job_id } = req.params;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(job_id)) {
      return errorResponse(res, 400, "Invalid Job ID format");
    }

    if (!req.file) {
      return errorResponse(res, 400, "No file provided");
    }

    const folderId = req.body.folder_id ?? req.body.folderId ?? null;

    const result = await jobService.uploadJobDocument(job_id, req.file, { folderId }, req.user);

    if (!result.success) {
      return errorResponse(res, result.statusCode || 400, result.message);
    }

    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("uploadJobDocument error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

// ──────────────────────────────────────────────────────────────────────────────
//  GET /job/:job_id/activity-log  — paginated audit trail for a job
// ──────────────────────────────────────────────────────────────────────────────
export async function getJobActivityLog(req, res) {
  try {
    const { job_id } = req.params;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(job_id)) {
      return errorResponse(res, 400, "Invalid Job ID format");
    }

    const result = await jobService.getJobActivityLog(job_id, req.user, req.query);

    if (!result.success) {
      return errorResponse(res, result.statusCode || 400, result.message);
    }

    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("getJobActivityLog error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

// ──────────────────────────────────────────────────────────────────────────────
//  GET /job/:job_id/commencement-letter/preview
//  Recipient options for the "To" dropdown + default subject (slide-over data).
// ──────────────────────────────────────────────────────────────────────────────
export async function getCommencementLetterPreview(req, res) {
  try {
    const { job_id } = req.params;
    const result = await jobService.getCommencementLetterPreview(job_id, req.user);

    if (!result.success) {
      return errorResponse(res, result.statusCode || 400, result.message);
    }

    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("getCommencementLetterPreview error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

// ──────────────────────────────────────────────────────────────────────────────
//  POST /job/:job_id/commencement-letter/send
//  Send the Commencement Letter email to the recipients selected on the frontend.
// ──────────────────────────────────────────────────────────────────────────────
export async function sendCommencementLetter(req, res) {
  try {
    const { job_id } = req.params;
    const { to, cc, subject, message, emailCopy } = req.body;

    const result = await jobService.sendCommencementLetter(job_id, req.user, {
      to,
      cc,
      subject,
      message,
      emailCopy,
    });

    if (!result.success) {
      return errorResponse(res, result.statusCode || 400, result.message);
    }

    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("sendCommencementLetter error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

// ──────────────────────────────────────────────────────────────────────────────
//  GET /job/:job_id/commencement-letter/public-details   (PUBLIC, token-secured)
//  Powers the customer's acknowledgment page reached from the emailed link.
// ──────────────────────────────────────────────────────────────────────────────
export async function getCommencementLetterPublicDetails(req, res) {
  try {
    const { job_id } = req.params;
    const result = await jobService.getCommencementLetterPublicDetails(job_id);

    if (!result.success) {
      return errorResponse(res, result.statusCode || 400, result.message);
    }

    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("getCommencementLetterPublicDetails error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

// ──────────────────────────────────────────────────────────────────────────────
//  POST /job/:job_id/commencement-letter/acknowledge     (PUBLIC, token-secured)
//  Records the customer's accept/decline + optional comments.
// ──────────────────────────────────────────────────────────────────────────────
export async function acknowledgeCommencementLetter(req, res) {
  try {
    const { job_id } = req.params;
    const { decision, comments, emailCopy } = req.body;

    const result = await jobService.acknowledgeCommencementLetter(job_id, {
      decision,
      comments,
      emailCopy,
    });

    if (!result.success) {
      return errorResponse(res, result.statusCode || 400, result.message);
    }

    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("acknowledgeCommencementLetter error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

// ──────────────────────────────────────────────────────────────────────────────
//  GET /job/:job_id/completion-approval
//  Current approval state + the Company Administrator / Site Supervisor list
//  the Confirmation drawer picks from.
// ──────────────────────────────────────────────────────────────────────────────
export async function getCompletionApproval(req, res) {
  try {
    const { job_id } = req.params;
    const result = await jobService.getCompletionApproval(job_id, req.user);

    if (!result.success) {
      return errorResponse(res, result.statusCode || 400, result.message);
    }

    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("getCompletionApproval error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

// ──────────────────────────────────────────────────────────────────────────────
//  POST /job/:job_id/completion-approval/send
//  Nominate the approver and queue the approval email.
// ──────────────────────────────────────────────────────────────────────────────
export async function sendCompletionApproval(req, res) {
  try {
    const { job_id } = req.params;
    const { approver_user_id, pci_date, occupancy_permit_date, handover_date } = req.body;

    const result = await jobService.sendCompletionApproval(job_id, req.user, {
      approverUserId: approver_user_id,
      pciDate: pci_date,
      occupancyPermitDate: occupancy_permit_date,
      handoverDate: handover_date,
    });

    if (!result.success) {
      return errorResponse(res, result.statusCode || 400, result.message);
    }

    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("sendCompletionApproval error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

// ──────────────────────────────────────────────────────────────────────────────
//  GET /job/:job_id/completion-approval/public-details   (PUBLIC, token-secured)
//  Powers the approver's accept/decline page reached from the emailed link.
// ──────────────────────────────────────────────────────────────────────────────
export async function getCompletionApprovalPublicDetails(req, res) {
  try {
    const { job_id } = req.params;
    const result = await jobService.getCompletionApprovalPublicDetails(job_id);

    if (!result.success) {
      return errorResponse(res, result.statusCode || 400, result.message);
    }

    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("getCompletionApprovalPublicDetails error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

// ──────────────────────────────────────────────────────────────────────────────
//  POST /job/:job_id/completion-approval/respond         (PUBLIC, token-secured)
//  Records the approver's accept/decline + optional comments.
// ──────────────────────────────────────────────────────────────────────────────
export async function respondCompletionApproval(req, res) {
  try {
    const { job_id } = req.params;
    const { decision, comments, emailCopy } = req.body;

    const result = await jobService.respondCompletionApproval(job_id, {
      decision,
      comments,
      emailCopy,
    });

    if (!result.success) {
      return errorResponse(res, result.statusCode || 400, result.message);
    }

    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("respondCompletionApproval error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

// ──────────────────────────────────────────────────────────────────────────────
//  Customer Feedback CRUD
// ──────────────────────────────────────────────────────────────────────────────
export async function createCustomerFeedback(req, res) {
  try {
    const { job_id } = req.params;
    const { template } = req.body;

    const result = await jobService.createCustomerFeedback(job_id, template, req.user);

    if (!result.success) {
      return errorResponse(res, result.statusCode || 400, result.message);
    }

    return successResponse(res, result.data, "Feedback requested successfully");
  } catch (error) {
    console.error("createCustomerFeedback error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function getCustomerFeedbackList(req, res) {
  try {
    const { job_id } = req.params;

    const result = await jobService.getCustomerFeedbackList(job_id, req.user);

    if (!result.success) {
      return errorResponse(res, result.statusCode || 400, result.message);
    }

    return successResponse(res, result.data, "Feedback list fetched successfully");
  } catch (error) {
    console.error("getCustomerFeedbackList error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function updateCustomerFeedback(req, res) {
  try {
    const { feedback_id } = req.params;
    const { comments, submitted_by, status } = req.body;

    const result = await jobService.updateCustomerFeedback(feedback_id, { comments, submitted_by, status }, req.user);

    if (!result.success) {
      return errorResponse(res, result.statusCode || 400, result.message);
    }

    return successResponse(res, result.data, "Feedback updated successfully");
  } catch (error) {
    console.error("updateCustomerFeedback error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function deleteCustomerFeedback(req, res) {
  try {
    const { feedback_id } = req.params;

    const result = await jobService.deleteCustomerFeedback(feedback_id, req.user);

    if (!result.success) {
      return errorResponse(res, result.statusCode || 400, result.message);
    }

    return successResponse(res, result.data, "Feedback deleted successfully");
  } catch (error) {
    console.error("deleteCustomerFeedback error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}
