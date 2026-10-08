import { errorResponse, successResponse } from "../../helper/response.js";
import {
  createDocumentFileNamingRuleService,
  getAllDocumentFileNamingRulesService,
  deleteDocumentFileNamingRuleService,
  updateDocumentFileNamingRuleService,
  createNamingFormatService,
  getNamingFormatService,
} from "./document-file-naming-rule.service.js";

// ─── Shared guard ─────────────────────────────────────────────────────────────

/** Returns true if the user context is missing both builder_id and company_id. */
function missingUserContext(builderId, companyId) {
  return !builderId && !companyId;
}

// ─── CREATE DOCUMENT FILE NAMING RULE ────────────────────────────────────────

export async function createDocumentFileNamingRule(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.users_id;

    const { file_type, folder_ids } = req.body;

    if (!file_type || file_type.trim() === "") {
      return errorResponse(res, 400, "file_type is required.");
    }

    const result = await createDocumentFileNamingRuleService({
      builderId,
      companyId,
      userId,
      file_type,
      folder_ids,
    });

    if (result.error) {
      return errorResponse(res, result.error.status, result.error.message);
    }

    return successResponse(res, result.data, "Document file naming rule created successfully.");
  } catch (error) {
    console.error("Error creating document file naming rule:", error);
    return errorResponse(res, 500, "Internal server error.", error.message);
  }
}

// ─── GET ALL DOCUMENT FILE NAMING RULES ──────────────────────────────────────

export async function getAllDocumentFileNamingRules(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (missingUserContext(builderId, companyId)) {
      return errorResponse(res, 401, "Unauthorized: Missing builder or company ID.");
    }

    const { page, limit } = req.query;

    const result = await getAllDocumentFileNamingRulesService({
      builderId,
      companyId,
      page,
      limit,
    });

    return successResponse(
      res,
      result.data,
      "Document file naming rules fetched successfully.",
    );
  } catch (error) {
    console.error("Error fetching document file naming rules:", error);
    return errorResponse(res, 500, "Internal server error.", error.message);
  }
}

// ─── DELETE DOCUMENT FILE NAMING RULE ────────────────────────────────────────

export async function deleteDocumentFileNamingRule(req, res) {
  try {
    const { document_file_naming_rule_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!document_file_naming_rule_id) {
      return errorResponse(res, 400, "document_file_naming_rule_id is required.");
    }

    if (missingUserContext(builderId, companyId)) {
      return errorResponse(res, 401, "Unauthorized: Missing builder or company ID.");
    }

    const result = await deleteDocumentFileNamingRuleService({
      document_file_naming_rule_id,
      builderId,
      companyId,
    });

    if (result.error) {
      return errorResponse(res, result.error.status, result.error.message);
    }

    return successResponse(res, null, "Document file naming rule deleted successfully.");
  } catch (error) {
    console.error("Error deleting document file naming rule:", error);
    return errorResponse(res, 500, "Internal server error.", error.message);
  }
}

// ─── UPDATE DOCUMENT FILE NAMING RULE ────────────────────────────────────────

export async function updateDocumentFileNamingRule(req, res) {
  try {
    const { document_file_naming_rule_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.users_id;

    if (!document_file_naming_rule_id) {
      return errorResponse(res, 400, "document_file_naming_rule_id is required.");
    }

    if (missingUserContext(builderId, companyId)) {
      return errorResponse(res, 401, "Unauthorized: Missing builder or company ID.");
    }

    const { file_type, folder_ids } = req.body;

    const result = await updateDocumentFileNamingRuleService({
      document_file_naming_rule_id,
      builderId,
      companyId,
      userId,
      file_type,
      folder_ids,
    });

    if (result.error) {
      return errorResponse(res, result.error.status, result.error.message);
    }

    return successResponse(res, result.data, "Document file naming rule updated successfully.");
  } catch (error) {
    console.error("Error updating document file naming rule:", error);
    return errorResponse(res, 500, "Internal server error.", error.message);
  }
}

// ─── CREATE NAMING FORMAT ─────────────────────────────────────────────────────

export async function createNamingFormat(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.users_id;

    if (missingUserContext(builderId, companyId)) {
      return errorResponse(res, 401, "Unauthorized: Missing builder or company ID.");
    }

    const { naming_format } = req.body;

    if (!naming_format || naming_format.trim() === "") {
      return errorResponse(res, 400, "naming_format is required.");
    }

    const result = await createNamingFormatService({
      builderId,
      companyId,
      userId,
      naming_format,
    });

    if (result.error) {
      return errorResponse(res, result.error.status, result.error.message);
    }

    return successResponse(res, result.data, "Naming format created successfully.");
  } catch (error) {
    console.error("Error creating naming format:", error);
    return errorResponse(res, 500, "Internal server error.", error.message);
  }
}

// ─── GET NAMING FORMAT ────────────────────────────────────────────────────────

export async function getNamingFormat(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.users_id;

    if (missingUserContext(builderId, companyId)) {
      return errorResponse(res, 401, "Unauthorized: Missing builder or company ID.");
    }

    const result = await getNamingFormatService({ builderId, companyId, userId });

    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("Error getting naming format:", error);
    return errorResponse(res, 500, "Internal server error.", error.message);
  }
}
