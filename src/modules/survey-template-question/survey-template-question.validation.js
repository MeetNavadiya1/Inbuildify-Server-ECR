import Joi from "joi";

export const createSurveyQuestionSchema = Joi.object({
  survey_template_id: Joi.string()
    .uuid({ version: "uuidv4" })
    .required()
    .messages({
      "any.required": "survey_template_id is required",
      "string.guid": "survey_template_id must be a valid UUID",
    }),
  description: Joi.string().trim().required().messages({
    "any.required": "description is required",
    "string.empty": "description cannot be empty",
  }),
  option_type: Joi.string()
    .max(50)
    .valid("text", "radio", "star_1_to_5", "star_1_to_10")
    .required()
    .messages({
      "any.required": "option_type is required",
      "any.only":
        "option_type must be one of text, radio, star_1_to_5, star_1_to_10",
    }),
  options: Joi.when("option_type", {
    is: "radio",
    then: Joi.array()
      .items(Joi.string().trim().optional())
      .min(1)
      .optional()
      .messages({
        "any.required": "options array is required when option_type is radio",
        "array.min": "options array cannot be empty when option_type is radio",
      }),
    otherwise: Joi.forbidden().messages({
      "any.unknown": "options can only be provided when option_type is radio",
    }),
  }),
  is_required: Joi.boolean().optional().default(true).messages({
    "boolean.base": "is_required must be true or false.",
  }),
  sort_order: Joi.number().integer().min(0).optional().messages({
    "number.base": "sort_order must be a number",
    "number.integer": "sort_order must be an integer",
    "number.min": "sort_order cannot be negative",
  }),
});

export const getAllSurveyTemplateQuestionSchema = Joi.object({
  survey_template_id: Joi.string().uuid().optional().messages({
    "string.guid": "Survey template ID must be a valid UUID",
  }),
  page: Joi.number().integer().min(1).default(1).messages({
    "number.base": "Page must be a number",
    "number.integer": "Page must be an integer",
    "number.min": "Page must be greater than 0",
  }),

  limit: Joi.number().integer().min(1).max(100).default(10).messages({
    "number.base": "Limit must be a number",
    "number.integer": "Limit must be an integer",
    "number.min": "Limit must be at least 1",
    "number.max": "Limit must not exceed 100",
  }),
});

export const deleteSurveyTemplateQuestionSchema = Joi.object({
  survey_question_id: Joi.string().uuid().required().messages({
    "string.guid": "Survey template question ID must be a valid UUID",
    "any.required": "Survey template question ID is required",
  }),
});

export const updateSurveyTemplateQuestionParamsSchema = Joi.object({
  survey_question_id: Joi.string().uuid().required().messages({
    "string.guid": "Survey template question ID must be a valid UUID",
    "any.required": "Survey template question ID is required",
  }),
});

export const updateSurveyTemplateQuestionSchema = Joi.object({
  description: Joi.string().trim().optional().messages({
    "string.empty": "description cannot be empty",
  }),
  option_type: Joi.string()
    .max(50)
    .valid("text", "radio", "star_1_to_5", "star_1_to_10")
    .optional()
    .messages({
      "any.only":
        "option_type must be one of text, radio, star_1_to_5, star_1_to_10",
    }),
  options: Joi.when("option_type", {
    is: "radio",
    then: Joi.array()
      .items(Joi.string().trim().optional())
      .min(1)
      .optional()
      .messages({
        "any.required": "options array is required when option_type is radio",
        "array.min": "options array cannot be empty when option_type is radio",
      }),
  }),
  is_required: Joi.boolean().optional().messages({
    "boolean.base": "is_required must be true or false.",
  }),
  sort_order: Joi.number().integer().min(0).optional().messages({
    "number.base": "sort_order must be a number",
    "number.integer": "sort_order must be an integer",
    "number.min": "sort_order cannot be negative",
  }),
});

export default {
  createSurveyQuestionSchema,
  getAllSurveyTemplateQuestionSchema,
  deleteSurveyTemplateQuestionSchema,
  updateSurveyTemplateQuestionParamsSchema,
  updateSurveyTemplateQuestionSchema,
};
