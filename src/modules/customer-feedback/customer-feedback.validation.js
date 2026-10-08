import Joi from "joi";

export const createFeedbackSchema = {
  params: Joi.object({
    job_id: Joi.string().uuid().required().messages({
      "string.guid": "Job ID must be a valid UUID",
      "any.required": "Job ID is required",
    }),
  }),
  body: Joi.object({
    template: Joi.string()
      .valid("Quality Feedback", "Customer sales Feedback")
      .required()
      .messages({
        "any.only": "Template must be either 'Quality Feedback' or 'Customer sales Feedback'",
        "any.required": "Template is required",
      }),
  }),
};

export const getFeedbackListSchema = {
  params: Joi.object({
    job_id: Joi.string().uuid().required().messages({
      "string.guid": "Job ID must be a valid UUID",
      "any.required": "Job ID is required",
    }),
  }),
};

export const updateFeedbackSchema = {
  params: Joi.object({
    feedback_id: Joi.string().uuid().required().messages({
      "string.guid": "Feedback ID must be a valid UUID",
      "any.required": "Feedback ID is required",
    }),
  }),
  body: Joi.object({
    comments: Joi.string().optional().allow("", null).messages({
      "string.base": "Comments must be a string",
    }),
    submitted_by: Joi.string().max(255).optional().allow("", null).messages({
      "string.base": "Submitted by must be a string",
      "string.max": "Submitted by must not exceed 255 characters",
    }),
    status: Joi.string()
      .valid("Requested", "Completed", "Pending")
      .required()
      .messages({
        "any.only": "Status must be one of: Requested, Completed, Pending",
      }),
  }),
};

export const deleteFeedbackSchema = {
  params: Joi.object({
    feedback_id: Joi.string().uuid().required().messages({
      "string.guid": "Feedback ID must be a valid UUID",
      "any.required": "Feedback ID is required",
    }),
  }),
};

export default {
  createFeedbackSchema,
  getFeedbackListSchema,
  updateFeedbackSchema,
  deleteFeedbackSchema,
};
