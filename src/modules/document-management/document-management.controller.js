import { successResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import * as documentManagementService from "./document-management.service.js";

export const listDocuments = async (req, res) => {
  try {
    const result = await documentManagementService.listDocumentsService(req.user, req.query);
    return successResponse(res, keysToCamelCase(result), "Documents fetched successfully.");
  } catch (error) {
    return handleControllerError(res, error, "Could not fetch the document list.");
  }
};

export const getDocumentDetail = async (req, res) => {
  try {
    const result = await documentManagementService.getDocumentDetailService(req.user, req.params.id);
    return successResponse(res, keysToCamelCase(result), "Document fetched.");
  } catch (error) {
    return handleControllerError(res, error, "Could not fetch the document.");
  }
};

/**
 * One document's audit history, newest first.
 *
 * Separate from the detail endpoint rather than folded into it: the detail is
 * one row and the history grows without bound, so a drawer that always fetched
 * both would get slower for every change ever made to the document.
 */
export const getDocumentActivity = async (req, res) => {
  try {
    // snake_case: camelToSnakeMiddleware has already rewritten the query keys by
    // the time this runs — the same reason listDocuments' schema is spelled that
    // way. Single-word keys are unchanged, which is why these two are not.
    const result = await documentManagementService.getDocumentActivityService(
      req.user,
      req.params.id,
      { limit: Number(req.query.limit) || 100, offset: Number(req.query.offset) || 0 },
    );
    return successResponse(res, keysToCamelCase(result), "Document activity fetched.");
  } catch (error) {
    return handleControllerError(res, error, "Could not fetch the document's activity.");
  }
};

export const setDocumentEditable = async (req, res) => {
  try {
    const { id } = req.params;
    // Tri-state: true / false is the admin's ruling, null clears it back to the
    // default (which also reads as on).
    const editable = req.body.editable === undefined ? null : req.body.editable;

    const result = await documentManagementService.setDocumentEditableService(req.user, id, editable);

    const MESSAGES = {
      null: "Editing permission reset to the default.",
      true: "Editing enabled for this document.",
      false: "This document is now view and download only.",
    };

    return successResponse(res, keysToCamelCase(result), MESSAGES[String(editable)]);
  } catch (error) {
    return handleControllerError(res, error, "Could not update the editing permission.");
  }
};

export default {
  listDocuments,
  getDocumentDetail,
  getDocumentActivity,
  setDocumentEditable,
};
