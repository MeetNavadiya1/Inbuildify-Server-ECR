
import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  createConstructionInspectionChecklistService,
  getConstructionInspectionChecklistsService,
  updateConstructionInspectionChecklistService,
  getConstructionInspectionChecklistByIdService,
  deleteConstructionInspectionChecklistService,
} from "./construction-inspection-checklist.service.js";

const formatInspectionChecklistResponse = (row) => {
  const base = {
    constructionInspectionChecklistId: row.constructionInspectionChecklistId,
    fieldName: row.fieldName,
    description: row.description,
    sortOrder: row.sortOrder,
    addAllExistingJobs: row.addAllExistingJobs,
    constructionOptionId:
      row.constructionOptionId || row.construction_option_id || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };

  if (row.fieldName === "section") {
    return {
      ...base,
      builder: row.builder,
      constructionType: row.constructionType,
      constructionStage: row.constructionStage,
    };
  }

  // checklist
  return {
    ...base,
    sectionId: row.section?.id || null,
  };
};

export async function createConstructionInspectionChecklist(req, res) {
  const userId = req.user?.users_id;
  const companyId = req.user?.company_id;
  const builderId = req.user?.builder_id;

  const {
    builder,
    construction_type_id,
    construction_stage_id,
    field_name,
    description,
    sort_order,
    construction_option_id,
    section_id,
    add_all_existing_jobs,
  } = req.body;

  try {
    if (!field_name || !description) {
      return errorResponse(res, 400, "field_name and description are required");
    }

    if (!["checklist", "section"].includes(field_name)) {
      return errorResponse(res, 400, "field_name must be either 'checklist' or 'section'");
    }

    if (field_name === "checklist" && !section_id) {
      return errorResponse(res, 400, "section_id is required when field_name is 'checklist'");
    }

    if (!companyId && !builderId) {
      return errorResponse(res, 400, "User must be associated with either company or builder");
    }

    if (field_name === "section") {
      const allowedSectionFields = [
        "builder", "construction_type_id", "construction_stage_id",
        "field_name", "description", "sort_order", "add_all_existing_jobs",
      ];
      const providedFields = Object.keys(req.body);
      for (const field of providedFields) {
        if (!allowedSectionFields.includes(field) && req.body[field] !== undefined) {
          return errorResponse(res, 400, `Field '${field}' is not allowed when field_name is 'section'. Only allowed fields: ${allowedSectionFields.join(", ")}`);
        }
      }

      if (!builder) {
        return errorResponse(res, 400, "builder is required when field_name is 'section'");
      }
      if (!construction_type_id) {
        return errorResponse(res, 400, "construction_type_id is required when field_name is 'section'");
      }
      if (!construction_stage_id) {
        return errorResponse(res, 400, "construction_stage_id is required when field_name is 'section'");
      }
    }

    const result = await createConstructionInspectionChecklistService({
      userId,
      companyId,
      builderId,
      builder,
      construction_type_id,
      construction_stage_id,
      field_name,
      description,
      sort_order,
      construction_option_id,
      section_id,
      add_all_existing_jobs,
    });

    return successResponse(res, keysToCamelCase(result), "Construction inspection checklist created successfully");
  } catch (error) {
    console.error("Error creating construction inspection checklist:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function getConstructionInspectionChecklists(req, res) {
  const { construction_type_id, construction_stage_id, builder, field_name } = req.query;
  const companyId = req.user?.company_id;
  const builderId = req.user?.builder_id;

  try {
    const result = await getConstructionInspectionChecklistsService({
      companyId, builderId, construction_type_id, construction_stage_id, builder, field_name,
    });

    return successResponse(res, keysToCamelCase(result), "Construction inspection checklists fetched successfully");
  } catch (error) {
    console.error("Error fetching construction inspection checklists:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function updateConstructionInspectionChecklist(req, res) {
  const { id } = req.params;
  const userId = req.user?.users_id;
  const companyId = req.user?.company_id;
  const builderId = req.user?.builder_id;

  const {
    builder, construction_type_id, construction_stage_id, field_name,
    description, sort_order, construction_option_id, section_id, add_all_existing_jobs,
  } = req.body;

  try {
    if (field_name && !["checklist", "section"].includes(field_name)) {
      return errorResponse(res, 400, "field_name must be either 'checklist' or 'section'");
    }

    if (Object.keys(req.body).length === 0) {
      return errorResponse(res, 400, "No fields provided to update");
    }

    const result = await updateConstructionInspectionChecklistService({
      id, userId, companyId, builderId, builder, construction_type_id,
      construction_stage_id, field_name, description, sort_order,
      construction_option_id, section_id, add_all_existing_jobs, body: req.body,
    });

    return successResponse(res, keysToCamelCase(result), "Construction inspection checklist updated successfully");
  } catch (error) {
    console.error("Error updating construction inspection checklist:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function getConstructionInspectionChecklistById(req, res) {
  const { id } = req.params;
  const companyId = req.user?.company_id;
  const builderId = req.user?.builder_id;

  try {
    if (!companyId && !builderId) {
      return errorResponse(res, 400, "User must be associated with either company or builder");
    }

    const result = await getConstructionInspectionChecklistByIdService({ id, companyId, builderId });

    return successResponse(res, keysToCamelCase(result), "Construction inspection checklists fetched successfully");
  } catch (error) {
    console.error("Error fetching construction inspection checklists by section ID:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function deleteConstructionInspectionChecklist(req, res) {
  const { id } = req.params;
  const { add_all_existing_jobs } = req.body;
  const companyId = req.user?.company_id;
  const builderId = req.user?.builder_id;

  try {
    const result = await deleteConstructionInspectionChecklistService({
      id, companyId, builderId, add_all_existing_jobs,
    });

    return successResponse(
      res,
      result.data ? keysToCamelCase(result.data) : null,
      result.message,
    );
  } catch (error) {
    console.error("Error deleting construction inspection checklist:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}
