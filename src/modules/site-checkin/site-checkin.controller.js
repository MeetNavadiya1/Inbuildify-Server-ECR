import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import {
  listFieldsService,
  createFieldService,
  updateFieldService,
  deleteFieldService,
  listRecordsService,
  reviewRecordService,
  getPublicFieldsService,
  submitPublicCheckinService,
} from "./site-checkin.service.js";

// ─── Fields (builder side) ───────────────────────────────────────────────────

export async function getFields(req, res) {
  try {
    const data = await listFieldsService({
      companyId: req.user?.company_id,
      builderId: req.user?.builder_id,
      userId: req.user?.user_id || req.user?.users_id,
    });
    return successResponse(res, data, "Check-in fields fetched successfully.");
  } catch (error) {
    console.error("Get Check-in Fields Error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error.");
  }
}

export async function createField(req, res) {
  try {
    const data = await createFieldService({
      companyId: req.user?.company_id,
      builderId: req.user?.builder_id,
      userId: req.user?.user_id || req.user?.users_id,
      data: req.body,
    });
    return successResponse(res, data, "Check-in field created successfully.");
  } catch (error) {
    console.error("Create Check-in Field Error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error.");
  }
}

export async function updateField(req, res) {
  try {
    const data = await updateFieldService({
      companyId: req.user?.company_id,
      userId: req.user?.user_id || req.user?.users_id,
      fieldId: req.params.site_checkin_field_id,
      data: req.body,
    });
    return successResponse(res, data, "Check-in field updated successfully.");
  } catch (error) {
    console.error("Update Check-in Field Error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error.");
  }
}

export async function deleteField(req, res) {
  try {
    const data = await deleteFieldService({
      companyId: req.user?.company_id,
      fieldId: req.params.site_checkin_field_id,
    });
    return successResponse(res, data, "Check-in field deleted successfully.");
  } catch (error) {
    console.error("Delete Check-in Field Error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error.");
  }
}

// ─── Records (builder side) ──────────────────────────────────────────────────

export async function listRecords(req, res) {
  try {
    const data = await listRecordsService({
      companyId: req.user?.company_id,
      query: req.query,
    });
    return successResponse(res, data, "Check-in records fetched successfully.");
  } catch (error) {
    console.error("List Check-in Records Error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error.");
  }
}

export async function confirmRecord(req, res) {
  try {
    const data = await reviewRecordService({
      companyId: req.user?.company_id,
      recordId: req.params.site_checkin_record_id,
      status: "CONFIRMED",
      confirmedBy: req.body.confirmed_by,
      builderNotes: req.body.builder_notes,
    });
    return successResponse(res, data, "Check-in confirmed successfully.");
  } catch (error) {
    console.error("Confirm Check-in Error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error.");
  }
}

export async function rejectRecord(req, res) {
  try {
    const data = await reviewRecordService({
      companyId: req.user?.company_id,
      recordId: req.params.site_checkin_record_id,
      status: "REJECTED",
      confirmedBy: req.body.confirmed_by,
      builderNotes: req.body.builder_notes,
    });
    return successResponse(res, data, "Check-in rejected.");
  } catch (error) {
    console.error("Reject Check-in Error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error.");
  }
}

// ─── Public (supplier side, no auth) ─────────────────────────────────────────

export async function getPublicFields(req, res) {
  try {
    const data = await getPublicFieldsService(req.params.token);
    return successResponse(res, data, "Check-in form fetched successfully.");
  } catch (error) {
    console.error("Get Public Check-in Form Error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error.");
  }
}

export async function submitPublicCheckin(req, res) {
  try {
    const data = await submitPublicCheckinService(req.params.token, req.body);
    return successResponse(res, data, "Check-in submitted successfully. Thank you!");
  } catch (error) {
    console.error("Submit Public Check-in Error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error.");
  }
}

export default {
  getFields,
  createField,
  updateField,
  deleteField,
  listRecords,
  confirmRecord,
  rejectRecord,
  getPublicFields,
  submitPublicCheckin,
};
