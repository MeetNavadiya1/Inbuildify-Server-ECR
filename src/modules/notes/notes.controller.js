import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import { checkLeadLockStatus } from "../../helper/leadLock.helper.js";
import notesService from "./notes.service.js";

/**
 * Create a new note
 */
export async function createNote(req, res) {
  try {
    const { leads_id, note_type, parent_note_id, link_type } = req.body;
    
    // We need to determine the lead_id for the lock check
    // If it's a reply, the lead_id comes from the parent note
    let effectiveLeadsId = leads_id;
    if (note_type === "reply" && parent_note_id) {
      const parentNote = await notesService.getNoteByIdService(parent_note_id, req.user);
      effectiveLeadsId = parentNote.leads_id;
    }

    if (!effectiveLeadsId) {
      return errorResponse(res, 400, "leads_id is required.");
    }

    const actualLinkType = link_type || req.body.linkType;
    const isJobScoped = ["Job", "Construction", "Maintenance"].includes(actualLinkType) || req.body.job_id || req.body.jobId;
    if (!isJobScoped) {
      await checkLeadLockStatus(effectiveLeadsId);
    }

    const result = await notesService.createNoteService(req.body, req.user, req.file);

    return successResponse(
      res,
      keysToCamelCase(result),
      "Note created successfully.",
      201
    );
  } catch (err) {
    console.error("Note creation error:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

/**
 * Get all notes
 */
export async function getAllNotes(req, res) {
  try {
    const { page = 1, limit = 25 } = req.query;
    const { notes, totalRecords } = await notesService.getAllNotesService(req.query, req.user);

    return successResponse(
      res,
      {
        notes: keysToCamelCase(notes),
        pagination: {
          totalRecords,
          totalPages: Math.ceil(totalRecords / parseInt(limit, 10)),
          currentPage: parseInt(page, 10),
          limit: parseInt(limit, 10),
        },
      },
      "Notes fetched successfully.",
    );
  } catch (err) {
    console.error("Error fetching notes:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

/**
 * Get a note by ID
 */
export async function getNoteById(req, res) {
  try {
    const { notes_id } = req.params;
    const data = await notesService.getNoteByIdService(notes_id, req.user);

    return successResponse(
      res,
      keysToCamelCase(data),
      "Note fetched successfully.",
    );
  } catch (err) {
    console.error("Error fetching note by ID:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

/**
 * Update a note
 */
export async function updateNote(req, res) {
  try {
    const { notes_id } = req.params;
    
    // Ownership and existence check via service
    const existingNote = await notesService.getNoteByIdService(notes_id, req.user);

    // Lock check — allow editing notes on jobs (won), block only when lost.
    await checkLeadLockStatus(existingNote.leads_id, null, { blockOutcomes: ["lost"] });

    const result = await notesService.updateNoteService(notes_id, req.body, req.user, req.file);

    return successResponse(
      res,
      keysToCamelCase(result),
      "Note updated successfully.",
    );
  } catch (err) {
    console.error("Error updating note:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

/**
 * Delete a note
 */
export async function deleteNote(req, res) {
  try {
    const { notes_id } = req.params;

    // Ownership and existence check via service
    const existingNote = await notesService.getNoteByIdService(notes_id, req.user);

    // Lock check — allow deleting notes on jobs (won), block only when lost.
    await checkLeadLockStatus(existingNote.leads_id, null, { blockOutcomes: ["lost"] });

    await notesService.deleteNoteService(notes_id, req.user);

    return successResponse(res, {}, "Note deleted successfully.");
  } catch (err) {
    console.error("Error deleting note:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export default {
  createNote,
  getAllNotes,
  getNoteById,
  updateNote,
  deleteNote,
};
