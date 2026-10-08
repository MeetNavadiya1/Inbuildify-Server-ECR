import { errorResponse, successResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  createSubChecklistService,
  getAllSubChecklistsService,
  getSubChecklistByIdService,
  updateSubChecklistService,
  deleteSubChecklistService,
} from "./construction-sub-checklist.service.js";

export async function createConstructionSubChecklist(req, res) {
  try {
    const {
      construction_checklist_id,
      name,
      data_required,
      no_of_days,
      sort_order,
    } = req.body;

    const { builder_id: builderId, company_id: companyId } = req.user;

    if (!construction_checklist_id) {
      return errorResponse(res, 400, "construction_checklist_id is required");
    }

    if (!name) {
      return errorResponse(res, 400, "name is required");
    }

    const result = await createSubChecklistService({
      construction_checklist_id,
      name,
      data_required,
      no_of_days,
      sort_order,
      builderId,
      companyId,
    });

    return successResponse(
      res,
      keysToCamelCase(result),
      "Construction sub checklist created successfully.",
    );
  } catch (error) {
    console.error("Create Construction Sub Checklist Error:", error);
    return handleControllerError(res, error, error.message || "Internal server error.");
  }
}

export async function getAllConstructionSubChecklists(req, res) {
  try {
    const { construction_checklist_id, data_required, no_of_days } = req.query;
    const { builder_id: builderId, company_id: companyId } = req.user;

    const result = await getAllSubChecklistsService({
      construction_checklist_id,
      data_required,
      no_of_days,
      builderId,
      companyId,
    });

    return successResponse(
      res,
      keysToCamelCase(result),
      "Construction sub checklists fetched successfully.",
    );
  } catch (error) {
    console.error("Get All Construction Sub Checklists Error:", error);
    return handleControllerError(res, error, error.message || "Internal server error.");
  }
}

export async function getConstructionSubChecklistById(req, res) {
  try {
    const { construction_sub_checklist_id } = req.params;
    const { builder_id: builderId, company_id: companyId } = req.user;

    if (!construction_sub_checklist_id) {
      return errorResponse(
        res,
        400,
        "construction_sub_checklist_id is required.",
      );
    }

    const result = await getSubChecklistByIdService({
      construction_sub_checklist_id,
      builderId,
      companyId,
    });

    return successResponse(
      res,
      keysToCamelCase(result),
      "Construction sub checklist fetched successfully.",
    );
  } catch (error) {
    console.error("Get Construction Sub Checklist By ID Error:", error);
    return handleControllerError(res, error, error.message || "Internal server error.");
  }
}

export async function updateConstructionSubChecklist(req, res) {
  try {
    const { construction_sub_checklist_id } = req.params;
    const { name, data_required, no_of_days, sort_order } = req.body;
    const { builder_id: builderId, company_id: companyId } = req.user;

    if (!construction_sub_checklist_id) {
      return errorResponse(
        res,
        400,
        "construction_sub_checklist_id is required.",
      );
    }

    const result = await updateSubChecklistService({
      construction_sub_checklist_id,
      name,
      data_required,
      no_of_days,
      sort_order,
      builderId,
      companyId,
    });

    return successResponse(
      res,
      keysToCamelCase(result),
      "Construction sub checklist updated successfully.",
    );
  } catch (error) {
    console.error("Update Construction Sub Checklist Error:", error);
    return handleControllerError(res, error, error.message || "Internal server error.");
  }
}

export async function deleteConstructionSubChecklist(req, res) {
  try {
    const { construction_sub_checklist_id } = req.params;
    const { builder_id: builderId, company_id: companyId } = req.user;

    if (!construction_sub_checklist_id) {
      return errorResponse(
        res,
        400,
        "construction_sub_checklist_id is required.",
      );
    }

    await deleteSubChecklistService({
      construction_sub_checklist_id,
      builderId,
      companyId,
    });

    return successResponse(
      res,
      {},
      "Construction sub checklist deleted successfully.",
    );
  } catch (error) {
    console.error("Delete Construction Sub Checklist Error:", error);
    return handleControllerError(res, error, error.message || "Internal server error.");
  }
}
