import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import {
  createSmsService,
  getAllSmsService,
  getSmsByIdService,
  updateSmsService,
  deleteSmsService,
} from "./sms.service.js";

export async function createSms(req, res) {
  try {
    const result = await createSmsService(req.body, req.user);

    if (result.error) {
      return errorResponse(res, result.error.status, result.error.message);
    }

    return successResponse(res, result.data, "SMS created successfully.");
  } catch (err) {
    console.error("Error creating SMS:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function getAllSms(req, res) {
  try {
    const result = await getAllSmsService(req.query, req.user);

    if (result.error) {
      return errorResponse(res, result.error.status, result.error.message);
    }

    return successResponse(res, result.data, "SMS fetched successfully.");
  } catch (err) {
    console.error("Error fetching SMS:", err);
    return handleControllerError(res, err, "Internal Server Error");
  }
}

export async function getSmsById(req, res) {
  try {
    const { sms_id } = req.params;
    const result = await getSmsByIdService(sms_id, req.user);

    if (result.error) {
      return errorResponse(res, result.error.status, result.error.message);
    }

    return successResponse(res, result.data, "SMS fetched successfully.");
  } catch (err) {
    console.error("Error fetching SMS by ID:", err);
    return handleControllerError(res, err, "Internal Server Error");
  }
}

export async function updateSms(req, res) {
  try {
    const { sms_id } = req.params;
    const result = await updateSmsService(sms_id, req.body, req.user);

    if (result.error) {
      return errorResponse(res, result.error.status, result.error.message);
    }

    return successResponse(res, result.data, "SMS updated successfully.");
  } catch (err) {
    console.error("Error updating SMS:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function deleteSms(req, res) {
  try {
    const { sms_id } = req.params;
    const result = await deleteSmsService(sms_id, req.user);

    if (result.error) {
      return errorResponse(res, result.error.status, result.error.message);
    }

    return successResponse(res, {}, "SMS deleted successfully.");
  } catch (err) {
    console.error("Error deleting SMS:", err);
    return handleControllerError(res, err, "Internal Server Error");
  }
}

