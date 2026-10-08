
import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";

import {
  getAllNoteTagService,
  createNotesTagService,
  updateNoteTagService,
  updateNoteTagIsActiveService,
  deleteNoteTagService,
} from "./note-tag.service.js"



export async function getAllNoteTag(req, res) {
  const builderId = req.user.builder_id;
  const { page = 1, limit = 25 } = req.query;

  try {
    const result = await getAllNoteTagService({
      builderId,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    });

    return successResponse(res, result, "Note tag fetched successfully.");
  } catch (error) {
    console.error("Error fetching note tag:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function createNotesTag(req, res) {
  const builderId = req.user.builder_id;
  const userId = req.user.user_id;
  const companyId = req.user?.company_id;

  try {
    if (!companyId) {
      return errorResponse(res, 400, "Company ID not found.");
    }

    const result = await createNotesTagService({
      builderId,
      companyId,
      userId,
      payload: req.body,
    });

    return successResponse(res, result, "Notes Tag created successfully.");
  } catch (err) {
    console.error("Error creating notes tag:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function updateNoteTag(req, res) {
  const { id } = req.params;
  const builderId = req.user?.builder_id;
  const companyId = req.user?.company_id;
  const userId = req.user?.user_id;

  try {
    if (!builderId) {
      return errorResponse(res, 401, "Unauthorized access");
    }

    const result = await updateNoteTagService({
      id,
      builderId,
      companyId,
      userId,
      payload: req.body,
    });

    return successResponse(res, result, "Notes tag updated successfully");
  } catch (error) {
    console.error("Update Notes Tag Error:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function updateNoteTagIsActive(req, res) {
  const builderId = req.user?.builder_id;
  const userId = req.user?.user_id;
  const { id } = req.params;
  const { is_active } = req.body;

  try {
    if (!id) {
      return errorResponse(res, 400, "note tag id is required");
    }

    if (typeof is_active !== "boolean") {
      return errorResponse(res, 400, "is_active must be boolean (true or false)");
    }

    const result = await updateNoteTagIsActiveService({ id, builderId, userId, is_active });

    return successResponse(res, result, "note tag status updated successfully.");
  } catch (error) {
    console.error("Error updating note tag is_active:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function deleteNoteTag(req, res) {
  const { id } = req.params;
  const builderId = req.user.builder_id;

  try {
    if (!id) {
      return errorResponse(res, 400, "Note tag ID is required.");
    }

    await deleteNoteTagService({ id, builderId });

    return successResponse(res, null, "Note tag deleted successfully.");
  } catch (error) {
    console.error("Error deleting note tag:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}
