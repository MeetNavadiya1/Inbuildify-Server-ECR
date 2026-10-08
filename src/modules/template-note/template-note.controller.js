import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import {
  getAllTemplateNotesService,
  updateTemplateNoteService,
  updateTemplateNoteIsActiveService,
  createTemplateNoteService,
} from "./template-note.service.js";

export async function createTemplateNote(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.users_id;

    const result = await createTemplateNoteService({
      builderId,
      companyId,
      userId,
      payload: req.body,
    });

    return successResponse(
      res,
      result,
      "Template note created successfully.",
    );
  } catch (error) {
    console.error("Error creating template note:", error);
    return handleControllerError(res, error, error.message || "Internal server error.");
  }
}

export async function getAllTemplateNotes(req, res) {
  try {
    const builderId = req.user.builder_id;

    const result = await getAllTemplateNotesService({
      builderId,
      queryParams: req.query,
    });

    return successResponse(res, result, "Template notes fetched successfully.");
  } catch (error) {
    console.error("Error fetching template notes:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function updateTemplateNote(req, res) {
  try {
    const { template_note_id } = req.params;
    const builderId = req.user.builder_id;
    const userId = req.user.users_id;

    const result = await updateTemplateNoteService({
      id: template_note_id,
      builderId,
      userId,
      payload: req.body,
    });

    return successResponse(res, result, "Template note updated successfully.");
  } catch (error) {
    console.error("Error updating template note:", error);
    return handleControllerError(res, error, error.message || "Internal server error.");
  }
}

export async function updateTemplateNoteIsActive(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.users_id;
    const { template_note_id } = req.params;

    if (!template_note_id) {
      return errorResponse(res, 400, "template_note_id is required");
    }

    const { result, newStatus } = await updateTemplateNoteIsActiveService({
      id: template_note_id,
      builderId,
      companyId,
      userId,
    });

    return successResponse(
      res,
      result,
      `Template note status updated successfully to ${newStatus ? "active" : "inactive"}`,
    );
  } catch (error) {
    console.error("Error updating template note is_active:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}
