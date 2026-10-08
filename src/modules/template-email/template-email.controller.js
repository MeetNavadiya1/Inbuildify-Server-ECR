import { errorResponse, successResponse, handleControllerError } from "../../helper/response.js";
import {
  getTemplateEmailsService,
  createTemplateEmailService,
  updateTemplateEmailService,
  deleteTemplateEmailService,
  updateTemplateEmailIsActiveService,
} from "./template-email.service.js";

export async function getTemplateEmails(req, res) {
  try {
    const result = await getTemplateEmailsService(req.user, req.query);
    return successResponse(res, result.responseData, result.message);
  } catch (error) {
    console.error("Error fetching template emails:", error);
    return handleControllerError(res, error, error.message || "Internal server error.");
  }
}

export async function updateTemplateEmail(req, res) {
  try {
    const builderId = req.user.builder_id;
    const companyId = req.user.company_id;
    const userId = req.user.user_id;
    const { id } = req.params;

    const result = await updateTemplateEmailService({
      id,
      builderId,
      companyId,
      userId,
      payload: req.body,
    });

    return successResponse(res, result, "Template email updated successfully.");
  } catch (error) {
    console.error("Update Template Email Error:", error);
    return handleControllerError(res, error, error.message || "Failed to update template email.");
  }
}

export async function deleteTemplateEmail(req, res) {
  try {
    const builderId = req.user.builder_id;
    const companyId = req.user.company_id;
    const userId = req.user.user_id;
    const { template_email_id } = req.params;

    await deleteTemplateEmailService({
      template_email_id,
      builderId,
      companyId,
      userId,
    });

    return successResponse(res, null, "Template email deleted successfully.");
  } catch (error) {
    console.error("Delete Template Email Error:", error);
    return handleControllerError(res, error, error.message || "Failed to delete template email.");
  }
}

export async function updateTemplateEmailIsActive(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.users_id;
    const { id } = req.params;

    const result = await updateTemplateEmailIsActiveService({
      id,
      builderId,
      companyId,
      userId,
    });

    return successResponse(res, result, "Template email status toggled successfully");
  } catch (error) {
    console.error("Error toggling template email is_active:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function createTemplateEmail(req, res) {
  const builderId = req.user.builder_id;
  const companyId = req.user.company_id;
  const userId = req.user.user_id;

  try {
    const result = await createTemplateEmailService({
      builderId,
      companyId,
      userId,
      payload: req.body,
    });

    return successResponse(res, result, "Template email created successfully.");
  } catch (error) {
    console.error("Create Template Email Error:", error);
    return handleControllerError(res, error, error.message || "Failed to create template email.");
  }
}
