import Joi from "joi";
import { NAME_PATTERN, NAME_PATTERN_MESSAGE } from "../../utils/validationPatterns.js";

export const createChecklistSchema = Joi.object({
  screen_id: Joi.string().uuid().required().messages({
    "string.guid": "Screen ID must be a valid UUID",
    "any.required": "Screen ID is required",
  }),
  name: Joi.string()
    .min(2)
    .max(150)
    .pattern(NAME_PATTERN)
    .required()
    .messages({
      "string.pattern.base": NAME_PATTERN_MESSAGE,
      "any.required": " name is required.",
    }),
  functionality_id: Joi.string().uuid().required().messages({
    "string.guid": "Functionality ID must be a valid UUID",
    "any.required": "Functionality ID is required",
  }),

  is_active: Joi.boolean().default(true),
});

export const getAllChecklistSchema = Joi.object({
  checklist_id: Joi.string().uuid().required().messages({
    "string.guid": "Checklist ID must be a valid UUID",
    "any.required": "Checklist ID is required",
  }),
});

export const deleteChecklistSchema = Joi.object({
  checklist_id: Joi.string().uuid().required().messages({
    "string.guid": "Checklist ID must be a valid UUID",
    "any.required": "Checklist ID is required",
  }),
});

export const updateChecklistParamsSchema = Joi.object({
  checklist_id: Joi.string().uuid().required().messages({
    "string.guid": "Checklist ID must be a valid UUID",
    "any.required": "Checklit ID is required",
  }),
});

export const updateChecklistSchema = Joi.object({
  screen_id: Joi.string().uuid().optional().messages({
    "string.guid": "Screen ID must be a valid UUID",
    "any.required": "Screen ID is required",
  }),
  name: Joi.string()
    .min(2)
    .max(150)
    .pattern(NAME_PATTERN)
    .optional()
    .messages({
      "string.pattern.base": NAME_PATTERN_MESSAGE,
      "any.required": " name is required.",
    }),
  functionality_id: Joi.string().uuid().optional().messages({
    "string.guid": "Functionality ID must be a valid UUID",
    "any.required": "Functionality ID is required",
  }),
});

export const updateChecklistIsActiveSchema = Joi.object({
  is_active: Joi.boolean().required(),
});

export default {
  createChecklistSchema,
  getAllChecklistSchema,
  deleteChecklistSchema,
  updateChecklistParamsSchema,
  updateChecklistSchema,
  updateChecklistIsActiveSchema,
};
