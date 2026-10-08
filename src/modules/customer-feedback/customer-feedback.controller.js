import customerFeedbackService from "./customer-feedback.service.js";
import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";

export async function createCustomerFeedback(req, res) {
  try {
    const { job_id } = req.params;
    const { template } = req.body;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(job_id)) {
      return errorResponse(res, 400, "Invalid Job ID format");
    }

    if (!template) {
      return errorResponse(res, 400, "Template is required");
    }

    const result = await customerFeedbackService.createCustomerFeedback(job_id, template, req.user);

    if (!result.success) {
      return errorResponse(res, result.statusCode || 400, result.message);
    }

    return successResponse(res, result.data, "Feedback requested successfully");
  } catch (error) {
    console.error("createCustomerFeedback error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function getCustomerFeedbackList(req, res) {
  try {
    const { job_id } = req.params;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(job_id)) {
      return errorResponse(res, 400, "Invalid Job ID format");
    }

    const result = await customerFeedbackService.getCustomerFeedbackList(job_id, req.user);

    if (!result.success) {
      return errorResponse(res, result.statusCode || 400, result.message);
    }

    return successResponse(res, result.data, "Feedback list fetched successfully");
  } catch (error) {
    console.error("getCustomerFeedbackList error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function updateCustomerFeedback(req, res) {
  try {
    const { feedback_id } = req.params;
    const { comments, submitted_by, status } = req.body;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(feedback_id)) {
      return errorResponse(res, 400, "Invalid Feedback ID format");
    }

    const result = await customerFeedbackService.updateCustomerFeedback(feedback_id, { comments, submitted_by, status }, req.user);

    if (!result.success) {
      return errorResponse(res, result.statusCode || 400, result.message);
    }

    return successResponse(res, result.data, "Feedback updated successfully");
  } catch (error) {
    console.error("updateCustomerFeedback error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function deleteCustomerFeedback(req, res) {
  try {
    const { feedback_id } = req.params;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(feedback_id)) {
      return errorResponse(res, 400, "Invalid Feedback ID format");
    }

    const result = await customerFeedbackService.deleteCustomerFeedback(feedback_id, req.user);

    if (!result.success) {
      return errorResponse(res, result.statusCode || 400, result.message);
    }

    return successResponse(res, result.data, "Feedback deleted successfully");
  } catch (error) {
    console.error("deleteCustomerFeedback error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}
