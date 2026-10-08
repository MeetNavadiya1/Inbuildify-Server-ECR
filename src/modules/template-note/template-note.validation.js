import Joi from "joi";
import { NAME_PATTERN, NAME_PATTERN_MESSAGE } from "../../utils/validationPatterns.js";

export const createTemplateNoteSchema = Joi.object({
  name: Joi.string()
    .trim()
    .pattern(NAME_PATTERN)
    .min(2)
    .max(200)
    .required(),
  content: Joi.string().min(2).max(1000).optional(),
  is_active: Joi.boolean().default(true),
});
export const getAllTemplateNotesSchema = Joi.object({
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

export const updateTemplateNoteParamsSchema = Joi.object({
  template_note_id: Joi.string().uuid().required().messages({
    "string.guid": "ID must be a valid UUID",
    "any.required": "ID is required",
  }),
});

export const updateTemplateNoteSchema = Joi.object({
  name: Joi.string().trim().min(2).max(200).optional(),
  content: Joi.string().allow("", null).max(1000).optional(),
  // is_active: Joi.boolean().optional(),
});

export const updateTemplateNoteIsActiveSchema = Joi.object({
  is_active: Joi.boolean().required(),
});

export default {
  createTemplateNoteSchema,
  getAllTemplateNotesSchema,
  updateTemplateNoteParamsSchema,
  updateTemplateNoteSchema,
  updateTemplateNoteIsActiveSchema,
};
