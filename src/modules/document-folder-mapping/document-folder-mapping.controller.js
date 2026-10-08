import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import {
  getAllDocumentFolderMappingsService,
  updateDocumentFolderMappingService,
} from "./document-folder-mapping.service.js";

// ─── Shared guard ─────────────────────────────────────────────────────────────

/** Returns true when both builder_id and company_id are absent from user context. */
function missingUserContext(builderId, companyId) {
  return !builderId && !companyId;
}

// ─── GET ALL DOCUMENT FOLDER MAPPINGS ────────────────────────────────────────

export async function getAllDocumentFolderMappings(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.users_id;

    if (missingUserContext(builderId, companyId)) {
      return errorResponse(res, 401, "Unauthorized: Missing builder or company ID.");
    }

    const result = await getAllDocumentFolderMappingsService({
      builderId,
      companyId,
      userId,
    });

    return successResponse(
      res,
      result.data,
      "Document folder mappings fetched successfully.",
    );
  } catch (err) {
    console.error("Error fetching document folder mappings:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error.");
  }
}

// ─── UPDATE DOCUMENT FOLDER MAPPING ──────────────────────────────────────────

export async function updateDocumentFolderMapping(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.users_id;

    if (missingUserContext(builderId, companyId)) {
      return errorResponse(res, 401, "Unauthorized: Missing builder or company ID.");
    }

    const {
      signed_quotation,
      signed_color,
      signed_variation,
      signed_maintenance,
      signed_contract_document,
      compliance_certificate,
      purchase_order,
      job_documents,
      select_all_files_from_folder,
    } = req.body;

    const result = await updateDocumentFolderMappingService({
      builderId,
      companyId,
      userId,
      signed_quotation,
      signed_color,
      signed_variation,
      signed_maintenance,
      signed_contract_document,
      compliance_certificate,
      purchase_order,
      job_documents,
      select_all_files_from_folder,
    });

    if (result.error) {
      return errorResponse(res, result.error.status, result.error.message);
    }

    return successResponse(
      res,
      result.data,
      "Document folder mapping updated successfully.",
    );
  } catch (err) {
    console.error("Error updating document folder mapping:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error.");
  }
}
