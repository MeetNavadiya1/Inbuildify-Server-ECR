import Joi from "joi";
import { NAME_PATTERN, NAME_PATTERN_MESSAGE } from "../../utils/validationPatterns.js";

export const createConstructionSubChecklistValidation = Joi.object({
  construction_checklist_id: Joi.string().uuid().required().messages({
    "string.uuid": "Construction checklist ID must be a valid UUID",
    "any.required": "Construction checklist ID is required",
  }),
  name: Joi.string()
    .min(2)
    .max(255)
    .pattern(NAME_PATTERN)
    .required()
    .messages({
      "string.empty": "Name cannot be empty",
      "any.required": "Name is required",
    }),
  data_required: Joi.boolean().optional().messages({
    "boolean.base": "Data required must be a boolean",
  }),
  no_of_days: Joi.number().integer().optional().messages({
    "number.integer": "No of days must be an integer",
  }),
  sort_order: Joi.number().integer().optional().messages({
    "number.integer": "Sort order must be an integer",
  }),
});

export const updateConstructionSubChecklistValidation = Joi.object({
  name: Joi.string()
    .min(2)
    .max(255)
    .pattern(NAME_PATTERN)
    .optional()
    .messages({
      "string.empty": "Name cannot be empty",
    }),
  data_required: Joi.boolean().optional().messages({
    "boolean.base": "Data required must be a boolean",
  }),
  no_of_days: Joi.number().integer().optional().messages({
    "number.integer": "No of days must be an integer",
  }),
  sort_order: Joi.number().integer().optional().messages({
    "number.integer": "Sort order must be an integer",
  }),
}).min(1);

export const getConstructionSubChecklistByIdValidation = Joi.object({
  construction_sub_checklist_id: Joi.string().uuid().required().messages({
    "string.uuid": "Construction sub checklist ID must be a valid UUID",
    "any.required": "Construction sub checklist ID is required",
  }),
});

export const queryValidation = Joi.object({
  page: Joi.number().integer().min(1).optional().messages({
    "number.integer": "Page must be an integer",
    "number.min": "Page must be at least 1",
  }),
  limit: Joi.number().integer().min(1).max(100).optional().messages({
    "number.integer": "Limit must be an integer",
    "number.min": "Limit must be at least 1",
    "number.max": "Limit must be at most 100",
  }),
  construction_checklist_id: Joi.string().uuid().optional().messages({
    "string.uuid": "Construction checklist ID must be a valid UUID",
  }),
  data_required: Joi.boolean().optional().messages({
    "boolean.base": "Data required must be a boolean",
  }),
  no_of_days: Joi.number().integer().optional().messages({
    "number.integer": "No of days must be an integer",
  }),
});

export default {
  createConstructionSubChecklistValidation,
  updateConstructionSubChecklistValidation,
  getConstructionSubChecklistByIdValidation,
  queryValidation,
};
