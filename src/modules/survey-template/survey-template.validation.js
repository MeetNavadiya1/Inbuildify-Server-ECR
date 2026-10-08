import Joi from "joi";
import { NAME_PATTERN, NAME_PATTERN_MESSAGE } from "../../utils/validationPatterns.js";

export const createSurveyTemplateSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(2)
    .max(200)
    .pattern(NAME_PATTERN)
    .required()
    .messages({
      "string.base": "name must be a string.",
      "string.empty": "name is required.",
      "any.required": "name is required.",
    }),

  // sort_order: Joi.number().integer().min(0).optional().default(0).messages({
  //   "number.base": "sort_order must be a number.",
  //   "number.min": "sort_order cannot be negative.",
  //   "number.integer": "sort_order must be an integer.",
  // }),

  is_recommended: Joi.boolean().default(false).messages({
    "boolean.base": "is_recommended must be true or false.",
  }),

  status: Joi.boolean().default(true).messages({
    "boolean.base": "status must be true or false.",
  }),
});

export const getAllSurveyTemplateSchema = Joi.object({
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

  name: Joi.string().trim().max(255).allow("").optional().messages({
    "string.max": "Name search term must not exceed 255 characters",
  }),

  sort_order: Joi.number().integer().min(0).optional().messages({
    "number.base": "Sort order must be a number",
    "number.integer": "Sort order must be an integer",
    "number.min": "Sort order must be 0 or greater",
  }),

  status: Joi.boolean().optional().messages({
    "any.only": "Status must be either 'true' or 'false'",
  }),
});

export const updateSurveyTemplateParamsSchema = Joi.object({
  survey_template_id: Joi.string().uuid().required().messages({
    "string.guid": "Survey template ID must be a valid UUID",
    "any.required": "Survey template ID is required",
  }),
});

export const updateSurveyTemplateSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(2)
    .max(200)
    .pattern(NAME_PATTERN)
    .optional()
    .messages({
      "string.base": "name must be a string.",
    }),

  sort_order: Joi.number().integer().min(0).optional().default(0).messages({
    "number.base": "sort_order must be a number.",
    "number.min": "sort_order cannot be negative.",
    "number.integer": "sort_order must be an integer.",
  }),

  is_recommended: Joi.boolean().messages({
    "boolean.base": "is_recommended must be true or false.",
  }),

  status: Joi.boolean().messages({
    "boolean.base": "status must be true or false.",
  }),
});

export default {
  createSurveyTemplateSchema,
  getAllSurveyTemplateSchema,
  updateSurveyTemplateParamsSchema,
  updateSurveyTemplateSchema,
};
