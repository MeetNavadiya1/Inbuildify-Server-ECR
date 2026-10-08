import * as surveyTemplateQuestionService from "./survey-template-question.service.js";
import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";

export async function createSurveyTemplateQuestion(req, res) {
  try {
    const result = await surveyTemplateQuestionService.createSurveyTemplateQuestion(req.user, req.body);
    return successResponse(res, result, "Survey template question created successfully.");
  } catch (error) {
    console.error("Create Survey Question Error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error.");
  }
}

export async function getAllSurveyTemplateQuestions(req, res) {
  try {
    const result = await surveyTemplateQuestionService.getAllSurveyTemplateQuestions(req.user, req.query);
    return successResponse(res, result, "Survey template questions fetched successfully.");
  } catch (error) {
    console.error("Error fetching survey template questions:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function deleteSurveyTemplateQuestion(req, res) {
  try {
    const { survey_question_id } = req.params;
    await surveyTemplateQuestionService.deleteSurveyTemplateQuestion(req.user, survey_question_id);
    return successResponse(res, null, "Survey template question deleted successfully.");
  } catch (error) {
    console.error("Error deleting survey template question:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function updateSurveyTemplateQuestion(req, res) {
  try {
    const { survey_question_id } = req.params;
    const result = await surveyTemplateQuestionService.updateSurveyTemplateQuestion(req.user, survey_question_id, req.body);
    return successResponse(res, result, "Survey template question updated successfully.");
  } catch (error) {
    console.error("Error updating survey template question:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}
