import { errorResponse, successResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  createConstructionChecklistService,
  getAllConstructionChecklistsService,
  getConstructionChecklistByIdService,
  updateConstructionChecklistService,
  deleteConstructionChecklistService,
} from "./construction-checklist.service.js";
//not used anywhere 
export async function getConstructionChecklistById(req, res) {
  try {
    const { construction_checklist_id } = req.params;

    if (!construction_checklist_id) {
      return errorResponse(res, 400, "construction_checklist_id is required.");
    }

    const result = await getConstructionChecklistByIdService({ construction_checklist_id });

    return successResponse(
      res,
      keysToCamelCase(result),
      "Construction checklist fetched successfully.",
    );
  } catch (error) {
    console.error("Get Construction Checklist By ID Error:", error);
    return handleControllerError(res, error, error.message || "Internal server error.");
  }
}

export async function createConstructionChecklist(req, res) {
  const { user_id, company_id, builder_id } = req.user;

  const {
    name,
    construction_type_id,
    construction_stage_id,
    supplier_type_id,
    sort_order,
    data_required,
    supplier,
    claim,
    dependent,
    no_of_days,
    notify,
    milestone,
    attachment_mandatory,
    attachment_mandatory_name,
    cost_center_id = [],
    construction_option_id = [],
    compliance_type_id,
    builder,
  } = req.body;

  try {
    if (!name) {
      return errorResponse(res, 400, "Name is required");
    }

    if (data_required === false && no_of_days) {
      return errorResponse(res, 400, "no_of_days cannot be set when data_required is false");
    }

    if (attachment_mandatory === false && attachment_mandatory_name) {
      return errorResponse(res, 400, "attachment_mandatory_name cannot be set when attachment_mandatory is false");
    }

    const result = await createConstructionChecklistService({
      user_id,
      company_id,
      builder_id,
      name,
      construction_type_id,
      construction_stage_id,
      supplier_type_id,
      sort_order,
      data_required,
      supplier,
      claim,
      dependent,
      no_of_days,
      notify,
      milestone,
      attachment_mandatory,
      attachment_mandatory_name,
      cost_center_id,
      construction_option_id,
      compliance_type_id,
      builder,
    });

    return successResponse(res, keysToCamelCase(result), "Construction checklist created successfully.");
  } catch (error) {
    console.error("Create Construction Checklist Error:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function getAllConstructionChecklists(req, res) {
  const { company_id, builder_id } = req.user;
  const { construction_type_id, construction_stage_id, builder, name } = req.query;

  try {
    const result = await getAllConstructionChecklistsService({
      company_id,
      builder_id,
      construction_type_id,
      construction_stage_id,
      builder,
      name,
    });

    return successResponse(res, keysToCamelCase(result), "Construction checklists fetched successfully.");
  } catch (error) {
    console.error("Get All Construction Checklists Error:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}


export async function updateConstructionChecklist(req, res) {
  const { construction_checklist_id } = req.params;
  const { user_id, company_id, builder_id } = req.user;

  const {
    name,
    construction_type_id,
    construction_stage_id,
    supplier_type_id,
    sort_order,
    data_required,
    supplier,
    claim,
    dependent,
    no_of_days,
    notify,
    milestone,
    attachment_mandatory,
    attachment_mandatory_name,
    cost_center_id,
    construction_option_id,
    compliance_type_id,
    builder,
    po_folder_id,
    job_documents_folder_id,
  } = req.body;

  try {
    if (!construction_checklist_id) {
      return errorResponse(res, 400, "construction_checklist_id is required.");
    }

    if (name !== undefined && !name) {
      return errorResponse(res, 400, "Name cannot be empty");
    }

    const result = await updateConstructionChecklistService({
      construction_checklist_id,
      user_id,
      company_id,
      builder_id,
      name,
      construction_type_id,
      construction_stage_id,
      supplier_type_id,
      sort_order,
      data_required,
      supplier,
      claim,
      dependent,
      no_of_days,
      notify,
      milestone,
      attachment_mandatory,
      attachment_mandatory_name,
      cost_center_id,
      construction_option_id,
      compliance_type_id,
      builder,
      po_folder_id,
      job_documents_folder_id,
    });

    return successResponse(res, keysToCamelCase(result), "Construction checklist updated successfully.");
  } catch (error) {
    console.error("Update Construction Checklist Error:", error);
    return handleControllerError(res, error, error.message || "Internal server error.");
  }
}

export async function deleteConstructionChecklist(req, res) {
  const { construction_checklist_id } = req.params;
  const { company_id, builder_id } = req.user;

  try {
    if (!construction_checklist_id) {
      return errorResponse(res, 400, "construction_checklist_id is required.");
    }

    await deleteConstructionChecklistService({
      constructionChecklistId: construction_checklist_id,
      companyId: company_id,
      builderId: builder_id,
    });

    return successResponse(res, {}, "Construction checklist deleted successfully.");
  } catch (error) {
    console.error("Delete Construction Checklist Error:", error);
    return handleControllerError(res, error, error.message || "Internal server error.");
  }
}
