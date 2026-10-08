import jobChecklistService from "./job-checklist.service.js";
import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";

const fail = (res, error, label) => {
  console.error(`${label} error:`, error);
  return handleControllerError(res, error, error.message || "Internal server error");
};

export async function getJobChecklist(req, res) {
  try {
    const result = await jobChecklistService.getJobChecklist(req.params.job_id, req.query, req.user);
    return successResponse(res, result, "Job checklist fetched successfully");
  } catch (error) {
    return fail(res, error, "getJobChecklist");
  }
}

export async function getChecklistTemplates(req, res) {
  try {
    const result = await jobChecklistService.getAvailableTemplates(req.user);
    return successResponse(res, result, "Checklist templates fetched successfully");
  } catch (error) {
    return fail(res, error, "getChecklistTemplates");
  }
}

export async function addJobChecklistItem(req, res) {
  try {
    const result = await jobChecklistService.addItem(req.params.job_id, req.body, req.user);
    return successResponse(res, result, "Checklist item added");
  } catch (error) {
    return fail(res, error, "addJobChecklistItem");
  }
}

export async function applyChecklistTemplate(req, res) {
  try {
    const result = await jobChecklistService.applyTemplate(
      req.params.job_id,
      req.body.checklist_id,
      req.user,
    );
    return successResponse(res, result, `Checklist applied — ${result.added} item(s) added`);
  } catch (error) {
    return fail(res, error, "applyChecklistTemplate");
  }
}

export async function updateJobChecklistItem(req, res) {
  try {
    const result = await jobChecklistService.updateItem(req.params.item_id, req.body, req.user);
    return successResponse(res, result, "Checklist item updated");
  } catch (error) {
    return fail(res, error, "updateJobChecklistItem");
  }
}

export async function setJobChecklistItemResponse(req, res) {
  try {
    const result = await jobChecklistService.setResponse(req.params.item_id, req.body, req.user);
    return successResponse(res, result, "Checklist item saved");
  } catch (error) {
    return fail(res, error, "setJobChecklistItemResponse");
  }
}

export async function deleteJobChecklistItem(req, res) {
  try {
    const result = await jobChecklistService.deleteItem(req.params.item_id, req.user);
    return successResponse(res, result, "Checklist item deleted");
  } catch (error) {
    return fail(res, error, "deleteJobChecklistItem");
  }
}

export default {
  getJobChecklist,
  getChecklistTemplates,
  addJobChecklistItem,
  applyChecklistTemplate,
  updateJobChecklistItem,
  setJobChecklistItemResponse,
  deleteJobChecklistItem,
};
