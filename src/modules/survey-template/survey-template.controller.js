import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import { getAllSurveyTemplatesService, createSurveyTemplateService, updateSurveyTemplateService } from "./survey-template.service.js";

export async function createSurveyTemplate(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.user_id;

    const data = await createSurveyTemplateService({
      builderId,
      companyId,
      userId,
      data: req.body,
    });

    return successResponse(
      res,
      data,
      "Survey template created successfully.",
    );
  } catch (error) {
    console.error("Create Survey Template Error:", error);
    return errorResponse(
      res,
      error.status || 500,
      error.message || "Internal Server Error.",
    );
  }
}

export async function getAllSurveyTemplate(req, res) {
  try {
    const builderId = req.user.builder_id;

    const data = await getAllSurveyTemplatesService({
      builderId,
      query: req.query,
    });

    return successResponse(res, data, "Survey templates fetched successfully.");
  } catch (error) {
    console.error("Error fetching survey templates:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function updateSurveyTemplate(req, res) {
  try {
    const builderId = req.user.builder_id;
    const companyId = req.user.company_id;
    const userId = req.user.user_id;

    const { survey_template_id } = req.params;

    const data = await updateSurveyTemplateService({
      surveyTemplateId: survey_template_id,
      builderId,
      companyId,
      userId,
      data: req.body,
    });

    return successResponse(
      res,
      data,
      "Survey template updated successfully.",
    );
  } catch (error) {
    console.error("Update Survey Template Error:", error);
    return errorResponse(
      res,
      error.status || 500,
      error.message || "Internal server error.",
    );
  }
}
