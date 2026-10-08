import quotationService from "./quotation.service.js";
import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import {
  upsertQuotationDriveFile,
  deleteQuotationDriveFile,
} from "../../helper/quotationDriveFile.helper.js";
import { DRIVE_FILE_MAPPING } from "../../constants/driveFile.js";

export async function getAllQuotations(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId) {
      return errorResponse(res, 401, "Unauthorized: Builder ID missing");
    }

    const {
      page = 1,
      limit = 10,
      search = "",
      status = "",
      statuses = "",
      leadIds = "",
      contactIds = "",
      startDate = "",
      endDate = "",
      sortBy = "",
      sortOrder = "",
    } = req.query;
    const statusList = Array.isArray(statuses)
      ? statuses
      : String(statuses || "")
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);
    const leadIdList = Array.isArray(leadIds)
      ? leadIds
      : String(leadIds || "")
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);
    const contactIdList = Array.isArray(contactIds)
      ? contactIds
      : String(contactIds || "")
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);

    const result = await quotationService.getAllQuotations(builderId, companyId, {
      page,
      limit,
      search,
      status,
      statuses: statusList,
      leadIds: leadIdList,
      contactIds: contactIdList,
      startDate,
      endDate,
      sortBy: String(sortBy || ""),
      sortOrder: String(sortOrder || ""),
    }, req.user);

    if (result.success) {
      return successResponse(res, result.data, result.message);
    }
    return errorResponse(res, 400, result.message);
  } catch (error) {
    if (!error.status || error.status >= 500) {
      console.error("Quotation operation error:", error);
    }
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function getQuotationUsageHistory(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId) {
      return errorResponse(res, 401, "Unauthorized: Builder ID missing");
    }

    const { entity_type: entityType, entity_id: entityId } = req.params;
    const {
      page = 1,
      limit = 10,
      referenceNo = "",
      customerName = "",
      propertyAddress = "",
      quotationStatus = "",
      leadStatus = "",
    } = req.query;

    const result = await quotationService.getQuotationUsageHistory(
      builderId,
      companyId,
      entityType,
      entityId,
      {
        page,
        limit,
        referenceNo: String(referenceNo || ""),
        customerName: String(customerName || ""),
        propertyAddress: String(propertyAddress || ""),
        quotationStatus: String(quotationStatus || ""),
        leadStatus: String(leadStatus || ""),
      },
    );

    if (result.success) {
      return successResponse(res, result.data, result.message);
    }
    return errorResponse(res, 400, result.message);
  } catch (error) {
    if (!error.status || error.status >= 500) {
      console.error("Quotation operation error:", error);
    }
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function getQuotationFilterOptions(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId) {
      return errorResponse(res, 401, "Unauthorized: Builder ID missing");
    }

    const result = await quotationService.getQuotationFilterOptions(builderId, companyId);
    if (result.success) {
      return successResponse(res, result.data, result.message);
    }
    return errorResponse(res, 400, result.message);
  } catch (error) {
    if (!error.status || error.status >= 500) {
      console.error("Quotation operation error:", error);
    }
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function getQuotationStatusCounts(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId) {
      return errorResponse(res, 401, "Unauthorized: Builder ID missing");
    }

    const result = await quotationService.getQuotationCountsByStatus(builderId, companyId);

    if (result.success) {
      return successResponse(res, result.data, result.message);
    }
    return errorResponse(res, 400, result.message);
  } catch (error) {
    if (!error.status || error.status >= 500) {
      console.error("Quotation operation error:", error);
    }
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function createQuotation(req, res) {
  try {
    const { leads_id } = req.params;
    const userId = req.user?.users_id;
    const builderId = req.user?.builder_id;
    console.log("🚀 ~ createQuotation ~ builderId:", builderId)
    const companyId = req.user?.company_id;

    if (!userId || !builderId) {
      return errorResponse(
        res,
        401,
        "Unauthorized: User or builder ID missing",
      );
    }

    const result = await quotationService.createQuotation(
      leads_id,
      userId,
      builderId,
      companyId,
    );

    if (result.success) {
      return successResponse(res, result.data, result.message);
    }
    return errorResponse(res, 400, result.message);

  } catch (error) {
    if (!error.status || error.status >= 500) {
      console.error("Quotation operation error:", error);
    }
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function getQuotationsByLeadId(req, res) {
  try {
    const { leads_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId) {
      return errorResponse(
        res,
        401,
        "Unauthorized: Builder ID missing",
      );
    }

    const result = await quotationService.getQuotationsByLeadId(
      leads_id,
      builderId,
      companyId,
    );

    if (result.success) {
      return successResponse(res, result.data, result.message);
    }
    return errorResponse(res, 400, result.message);

  } catch (error) {
    if (!error.status || error.status >= 500) {
      console.error("Quotation operation error:", error);
    }
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function getQuotationById(req, res) {
  try {
    const { quotation_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId) {
      return errorResponse(res, 401, "Unauthorized: Builder ID missing");
    }

    const result = await quotationService.getQuotationById(
      quotation_id,
      builderId,
      companyId,
      req.user,
    );

    if (result.success) {
      return successResponse(res, result.data, result.message);
    }
    return errorResponse(res, 404, result.message);

  } catch (error) {
    if (!error.status || error.status >= 500) {
      console.error("Quotation operation error:", error);
    }
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function getQuotationVersions(req, res) {
  try {
    const { quotation_id } = req.params;
    const { version_id } = req.query;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId) {
      return errorResponse(res, 401, "Unauthorized: Builder ID missing");
    }

    const result = await quotationService.getQuotationVersions(
      quotation_id,
      builderId,
      companyId,
      version_id,
    );

    if (result.success) {
      return successResponse(res, result.data, result.message);
    }
    return errorResponse(res, 400, result.message);

  } catch (error) {
    if (!error.status || error.status >= 500) {
      console.error("Quotation operation error:", error);
    }
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function getQuotationVersionById(req, res) {
  try {
    const { quotation_version_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId) {
      return errorResponse(res, 401, "Unauthorized: Builder ID missing");
    }

    const result = await quotationService.getQuotationVersionById(
      quotation_version_id,
      builderId,
      companyId,
    );

    if (result.success) {
      return successResponse(res, result.data, result.message);
    }
    return errorResponse(res, 400, result.message);

  } catch (error) {
    if (!error.status || error.status >= 500) {
      console.error("Quotation operation error:", error);
    }
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function updateQuotationVersion(req, res) {
  try {
    const { quotation_version_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId) {
      return errorResponse(res, 401, "Unauthorized: Builder ID missing");
    }

    // If the multer-s3 middleware uploaded an uploadReport file, persist it
    // as a DriveFile (sub_reference_type=StructureEngineerUpload). Per the
    // DriveFile blueprint we no longer write the legacy upload_report column
    // — strip it out of req.body so nothing trickles through to the service.
    const reportUploaded = req.file && req.file.fieldname === "uploadReport";
    if (reportUploaded) {
      await upsertQuotationDriveFile({
        versionId: quotation_version_id,
        subReferenceType: DRIVE_FILE_MAPPING.SUB_REFERENCES.STRUCTURE_ENGINEER_UPLOAD,
        s3Key: req.file.key,
        size: req.file.size,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        builderId,
        companyId,
        uploadedBy: req.user?.users_id || null,
      });
    }
    delete req.body.upload_report;

    // A report-only upload carries no quotation columns to change. The DriveFile
    // upsert above IS the update, so calling the service with an empty payload
    // would return "No valid fields provided for update" — a false 400 even
    // though the file was saved. Short-circuit to success in that case.
    if (reportUploaded && Object.keys(req.body).length === 0) {
      return successResponse(res, null, "Report uploaded successfully");
    }

    const result = await quotationService.updateQuotationVersion(
      quotation_version_id,
      req.body,
      builderId,
      companyId,
      req.user?.users_id,
    );

    if (result.success) {
      return successResponse(res, result.data, result.message);
    }
    // The columns updated fine but the report file still saved above — don't
    // surface the "no valid fields" error when a report was uploaded.
    if (reportUploaded && result.message === "No valid fields provided for update") {
      return successResponse(res, null, "Report uploaded successfully");
    }
    return errorResponse(res, 400, result.message);

  } catch (error) {
    if (!error.status || error.status >= 500) {
      console.error("Quotation operation error:", error);
    }
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function deleteQuotation(req, res) {
  try {
    const { quotation_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId) {
      return errorResponse(res, 401, "Unauthorized: Builder ID missing");
    }

    const result = await quotationService.deleteQuotation(
      quotation_id,
      builderId,
      companyId,
      req.user?.users_id,
    );

    if (result.success) {
      return successResponse(res, result.data, result.message);
    }
    return errorResponse(res, 400, result.message);

  } catch (error) {
    if (!error.status || error.status >= 500) {
      console.error("Quotation operation error:", error);
    }
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function duplicateQuotationVersion(req, res) {
  try {
    const { quotation_version_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId) {
      return errorResponse(res, 401, "Unauthorized: Builder ID missing");
    }

    const result = await quotationService.duplicateQuotationVersion(
      quotation_version_id,
      builderId,
      companyId,
      req.user?.users_id,
    );

    if (result.success) {
      return successResponse(res, result.data, result.message);
    }
    return errorResponse(res, 400, result.message);

  } catch (error) {
    if (!error.status || error.status >= 500) {
      console.error("Quotation operation error:", error);
    }
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function compareQuotationVersions(req, res) {
  try {
    const { leads_id } = req.params;
    const { versions, show_all } = req.body;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId) {
      return errorResponse(res, 401, "Unauthorized: Builder ID missing");
    }

    const showAll = show_all !== false;

    const result = await quotationService.compareQuotationVersions(
      leads_id,
      versions,
      showAll,
      builderId,
      companyId,
    );

    if (result.success) {
      return successResponse(res, result.data, result.message);
    }
    return errorResponse(res, 400, result.message);

  } catch (error) {
    if (!error.status || error.status >= 500) {
      console.error("Quotation operation error:", error);
    }
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export const removePackageFromVersion = async (req, res) => {
  try {
    const { quotation_version_id, package_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId) {
      return errorResponse(res, 401, "Unauthorized: Builder ID missing");
    }

    const result = await quotationService.removePackageFromVersion(
      quotation_version_id,
      package_id,
      builderId,
      companyId,
      req.user?.users_id,
    );

    if (result.success) {
      return successResponse(res, result.data, result.message);
    }
    return errorResponse(res, 400, result.message);

  } catch (error) {
    if (!error.status || error.status >= 500) {
      console.error("Quotation operation error:", error);
    }
    return handleControllerError(res, error, error.message || "Internal server error");
  }
};

export async function previewPDF(req, res) {
  try {
    const { quotation_version_id } = req.params;
    const { download } = req.query;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId) {
      return errorResponse(res, 401, "Unauthorized: Builder ID missing");
    }

    const result = await quotationService.getQuotationPDF(
      quotation_version_id,
      builderId,
      companyId,
    );

    if (result.success) {
      const { pdfUrl } = result.data;
      return successResponse(res, { pdfUrl }, "PDF URL fetched successfully");
    }
    return errorResponse(res, 400, result.message);
  } catch (error) {
    if (!error.status || error.status >= 500) {
      console.error("Quotation operation error:", error);
    }
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function sendQuotationEmail(req, res) {
  try {
    const { quotation_version_id } = req.params;
    const userId = req.user?.user_id;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId) {
      return errorResponse(res, 401, "Unauthorized: Builder ID missing");
    }

    const result = await quotationService.sendQuotationEmail(
      quotation_version_id,
      userId,
      builderId,
      companyId,
    );

    if (result.success) {
      return successResponse(res, result.data, result.message);
    }
    return errorResponse(res, 400, result.message);
  } catch (error) {
    if (!error.status || error.status >= 500) {
      console.error("Quotation operation error:", error);
    }
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function getEngineerMailPreview(req, res) {
  try {
    const { quotation_version_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId) {
      return errorResponse(res, 401, "Unauthorized: Builder ID missing");
    }

    const result = await quotationService.getEngineerMailPreview(
      quotation_version_id,
      builderId,
      companyId
    );

    if (result.success) {
      return successResponse(res, result.data, result.message);
    }
    return errorResponse(res, 400, result.message);
  } catch (error) {
    if (!error.status || error.status >= 500) {
      console.error("Quotation operation error:", error);
    }
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function generateEngineeringRequirement(req, res) {
  try {
    const { quotation_version_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.users_id;

    if (!builderId) {
      return errorResponse(res, 401, "Unauthorized: Builder ID missing");
    }

    const result = await quotationService.generateEngineeringRequirement(
      quotation_version_id,
      builderId,
      companyId,
      userId
    );

    if (result.success) {
      return successResponse(res, result.data, result.message);
    }
    return errorResponse(res, 400, result.message);
  } catch (error) {
    if (!error.status || error.status >= 500) {
      console.error("Quotation operation error:", error);
    }
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function sendEngineerEmail(req, res) {
  try {
    const { quotation_version_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId) {
      return errorResponse(res, 401, "Unauthorized: Builder ID missing");
    }

    const { subject, email_body, template_email_id } = req.body;

    const result = await quotationService.sendEngineerEmail(
      quotation_version_id,
      builderId,
      companyId,
      { subject, email_body, template_email_id }
    );

    if (result.success) {
      return successResponse(res, result.data, result.message);
    }
    return errorResponse(res, 400, result.message);
  } catch (error) {
    if (!error.status || error.status >= 500) {
      console.error("Quotation operation error:", error);
    }
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function uploadStructureEngineerReport(req, res) {
  try {
    const { quotation_version_id } = req.params;
    const isExternal = req.isExternalRequest === true;
    const builderId = req.user?.builder_id || null;
    const companyId = req.user?.company_id || null;
    const userId = req.user?.users_id || null;

    // Internal callers must have a builder context. External callers are
    // authorized by the time-sensitive token verified upstream.
    if (!isExternal && !builderId) {
      return errorResponse(res, 401, "Unauthorized: Builder ID missing");
    }

    if (!req.file) {
      return errorResponse(res, 400, "Bad Request: No PDF file provided in request body");
    }

    const driveFile = await upsertQuotationDriveFile({
      versionId: quotation_version_id,
      subReferenceType: DRIVE_FILE_MAPPING.SUB_REFERENCES.STRUCTURE_ENGINEER_REPORT,
      s3Key: req.file.key,
      size: req.file.size,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      builderId,
      companyId,
      uploadedBy: userId,
    });

    const result = await quotationService.uploadStructureEngineerReport(
      quotation_version_id,
      req.file.location,
      builderId,
      companyId,
      userId,
      { isExternal }
    );

    if (result.success) {
      return successResponse(res, result.data, result.message);
    }
    return errorResponse(res, 400, result.message);
  } catch (error) {
    if (!error.status || error.status >= 500) {
      console.error("Quotation upload error:", error);
    }
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

// PUT /version/:quotation_version_id/structure-engineer-report
// Allows a structural engineer to replace an already-submitted report.
// The DriveFile upsert overwrites the existing s3_key in-place, so the
// logic is identical to the initial upload — only the response message differs.
export async function updateStructureEngineerReport(req, res) {

  try {
    const { quotation_version_id } = req.params;
    const isExternal = req.isExternalRequest === true;
    const builderId = req.user?.builder_id || null;
    const companyId = req.user?.company_id || null;
    const userId = req.user?.users_id || null;

    if (!isExternal && !builderId) {
      return errorResponse(res, 401, "Unauthorized: Builder ID missing");
    }

    if (!req.file) {
      return errorResponse(res, 400, "Bad Request: No PDF file provided in request body");
    }

    // upsertQuotationDriveFile finds the existing DriveFile row by the
    // polymorphic tuple and updates its s3_key in-place — no extra logic needed.
    await upsertQuotationDriveFile({
      versionId: quotation_version_id,
      subReferenceType: DRIVE_FILE_MAPPING.SUB_REFERENCES.STRUCTURE_ENGINEER_REPORT,
      s3Key: req.file.key,
      size: req.file.size,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      builderId,
      companyId,
      uploadedBy: userId,
    });

    const result = await quotationService.updateStructureEngineerReport(
      quotation_version_id,
      req.file.location,
      builderId,
      companyId,
      userId,
      { isExternal }
    );

    if (result.success) {
      return successResponse(res, result.data, result.message);
    }
    return errorResponse(res, 400, result.message);
  } catch (error) {
    if (!error.status || error.status >= 500) {
      console.error("Quotation update report error:", error);
    }
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function viewQuotationByHash(req, res) {
  try {
    const { hash } = req.params;
    const result = await quotationService.getQuotationByHash(hash);

    if (result.success) {
      return successResponse(res, result.data, "Quotation fetched successfully");
    }
    return errorResponse(res, 400, result.message);
  } catch (error) {
    console.error("View quotation by hash error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function getPublicDetailsByVersionId(req, res) {
  try {
    const { quotation_version_id } = req.params;
    const result = await quotationService.getPublicDetailsByVersionId(quotation_version_id);
    if (result.success) {
      return successResponse(res, result.data, result.message);
    }
    return errorResponse(res, 404, result.message);
  } catch (error) {
    console.error("Error in getPublicDetailsByVersionId controller:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export default {
  getAllQuotations,
  getQuotationUsageHistory,
  getQuotationFilterOptions,
  getQuotationStatusCounts,
  createQuotation,
  getQuotationsByLeadId,
  getQuotationById,
  getQuotationVersions,
  getQuotationVersionById,
  updateQuotationVersion,
  deleteQuotation,
  duplicateQuotationVersion,
  compareQuotationVersions,
  removePackageFromVersion,
  previewPDF,
  sendQuotationEmail,
  getEngineerMailPreview,
  generateEngineeringRequirement,
  sendEngineerEmail,
  viewQuotationByHash,
  uploadStructureEngineerReport,
  updateStructureEngineerReport,
  getPublicDetailsByVersionId,
};
