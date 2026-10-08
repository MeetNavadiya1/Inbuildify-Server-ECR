import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import {
  sendSurveyService,
  listSurveyResponsesService,
  getSurveyResponseByIdService,
  getPublicSurveyByTokenService,
  submitPublicSurveyService,
} from "./survey-response.service.js";

export async function sendSurvey(req, res) {
  try {
    const data = await sendSurveyService({
      builderId: req.user?.builder_id,
      companyId: req.user?.company_id,
      userId: req.user?.user_id || req.user?.users_id,
      data: req.body,
    });
    return successResponse(res, data, "Survey sent successfully.");
  } catch (error) {
    console.error("Send Survey Error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error.");
  }
}

export async function listSurveyResponses(req, res) {
  try {
    const data = await listSurveyResponsesService({
      builderId: req.user?.builder_id,
      query: req.query,
    });
    return successResponse(res, data, "Survey responses fetched successfully.");
  } catch (error) {
    console.error("List Survey Responses Error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error.");
  }
}

export async function getSurveyResponse(req, res) {
  try {
    const data = await getSurveyResponseByIdService({
      builderId: req.user?.builder_id,
      surveyResponseId: req.params.survey_response_id,
    });
    return successResponse(res, data, "Survey response fetched successfully.");
  } catch (error) {
    console.error("Get Survey Response Error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error.");
  }
}

// ---- Public (no auth) ----

export async function getPublicSurvey(req, res) {
  try {
    const data = await getPublicSurveyByTokenService(req.params.token);
    return successResponse(res, data, "Survey fetched successfully.");
  } catch (error) {
    console.error("Get Public Survey Error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error.");
  }
}

export async function submitPublicSurvey(req, res) {
  try {
    const data = await submitPublicSurveyService(req.params.token, req.body);
    return successResponse(res, data, "Survey submitted successfully. Thank you!");
  } catch (error) {
    console.error("Submit Public Survey Error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error.");
  }
}

export default {
  sendSurvey,
  listSurveyResponses,
  getSurveyResponse,
  getPublicSurvey,
  submitPublicSurvey,
};
