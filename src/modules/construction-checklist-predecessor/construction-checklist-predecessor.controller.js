import { errorResponse, successResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  createPredecessorService,
  getAllPredecessorsService,
  getPredecessorByIdService,
  updatePredecessorService,
  deletePredecessorService,
} from "./construction-checklist-predecessor.service.js";

export async function createConstructionChecklistPredecessor(req, res) {
  try {
    const {
      construction_checklist_id,
      predecessor_checklist_id,
      offset,
      duration,
    } = req.body;

    const { builder_id: builderId, company_id: companyId } = req.user;

    const result = await createPredecessorService({
      construction_checklist_id,
      predecessor_checklist_id,
      offset,
      duration,
      builderId,
      companyId,
    });

    return successResponse(
      res,
      keysToCamelCase(result),
      "Construction checklist predecessor created successfully.",
    );
  } catch (error) {
    console.error("Create Construction Checklist Predecessor Error:", error);
    return handleControllerError(res, error, error.message || "Internal server error.");
  }
}

export async function getAllConstructionChecklistPredecessors(req, res) {
  try {
    const {
      construction_checklist_id,
      predecessor_checklist_id,
      offset,
      duration,
    } = req.query;

    const { builder_id: builderId, company_id: companyId } = req.user;

    const result = await getAllPredecessorsService({
      construction_checklist_id,
      predecessor_checklist_id,
      offset,
      duration,
      builderId,
      companyId,
    });

    return successResponse(
      res,
      keysToCamelCase(result),
      "Construction checklist predecessors fetched successfully.",
    );
  } catch (error) {
    console.error("Get All Construction Checklist Predecessors Error:", error);
    return handleControllerError(res, error, error.message || "Internal server error.");
  }
}

export async function getConstructionChecklistPredecessorById(req, res) {
  try {
    const { construction_checklist_predecessor_id } = req.params;
    const { builder_id: builderId, company_id: companyId } = req.user;

    if (!construction_checklist_predecessor_id) {
      return errorResponse(
        res,
        400,
        "construction_checklist_predecessor_id is required.",
      );
    }

    const result = await getPredecessorByIdService({
      construction_checklist_predecessor_id,
      builderId,
      companyId,
    });

    return successResponse(
      res,
      keysToCamelCase(result),
      "Construction checklist predecessor fetched successfully.",
    );
  } catch (error) {
    console.error("Get Construction Checklist Predecessor By ID Error:", error);
    return handleControllerError(res, error, error.message || "Internal server error.");
  }
}

export async function updateConstructionChecklistPredecessor(req, res) {
  try {
    const { construction_checklist_predecessor_id } = req.params;
    const { predecessor_checklist_id, offset, duration } = req.body;
    const { builder_id: builderId, company_id: companyId } = req.user;

    if (!construction_checklist_predecessor_id) {
      return errorResponse(
        res,
        400,
        "construction_checklist_predecessor_id is required.",
      );
    }

    const result = await updatePredecessorService({
      construction_checklist_predecessor_id,
      predecessor_checklist_id,
      offset,
      duration,
      builderId,
      companyId,
    });

    return successResponse(
      res,
      keysToCamelCase(result),
      "Construction checklist predecessor updated successfully.",
    );
  } catch (error) {
    console.error("Update Construction Checklist Predecessor Error:", error);
    return handleControllerError(res, error, error.message || "Internal server error.");
  }
}

export async function deleteConstructionChecklistPredecessor(req, res) {
  try {
    const { construction_checklist_predecessor_id } = req.params;
    const { builder_id: builderId, company_id: companyId } = req.user;

    if (!construction_checklist_predecessor_id) {
      return errorResponse(
        res,
        400,
        "construction_checklist_predecessor_id is required.",
      );
    }

    await deletePredecessorService({
      construction_checklist_predecessor_id,
      builderId,
      companyId,
    });

    return successResponse(
      res,
      {},
      "Construction checklist predecessor deleted successfully.",
    );
  } catch (error) {
    console.error("Delete Construction Checklist Predecessor Error:", error);
    return handleControllerError(res, error, error.message || "Internal server error.");
  }
}
