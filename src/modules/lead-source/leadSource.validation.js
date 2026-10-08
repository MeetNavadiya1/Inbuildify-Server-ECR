import Joi from "joi";
import { NAME_PATTERN, NAME_PATTERN_MESSAGE } from "../../utils/validationPatterns.js";

const nameRule = Joi.string()
  .min(2)
  .max(150)
  .trim()
  .pattern(NAME_PATTERN)
  .messages({
    "string.base": "Lead source name must be a string",
    "string.empty": "Lead source name is required",
    "string.min": "Lead source name must be at least 2 characters long",
    "string.max": "Lead source name must not exceed 100 characters",
    "string.pattern.base": NAME_PATTERN_MESSAGE,
    "any.required": "Lead source name is required",
  });

const sortOrderRule = Joi.number().integer().default(1).min(1);

const leadSourceIdRule = Joi.string().uuid().messages({
  "string.base": "Lead source ID must be a string",
  "string.empty": "Lead source ID is required",
  "string.guid": "Lead source ID must be a valid UUID",
  "any.required": "Lead source ID is required",
});

export const createLeadSourceSchema = Joi.object({
  name: nameRule.required(),
  sort_order: sortOrderRule.optional(),
  is_active: Joi.boolean().default(true),
  allow_change: Joi.boolean().default(true),
});

export const getLeadResourcesSchema = Joi.object({
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

export const getLeadSourceByIdSchema = Joi.object({
  lead_source_id: leadSourceIdRule.required(),
});

export const updateLeadSourceSchema = Joi.object({
  name: nameRule.optional(),
  sort_order: Joi.number().integer().min(1).optional(),
  allow_change: Joi.boolean().optional(),
});

export const updateLeadSourceParamsSchema = Joi.object({
  lead_source_id: leadSourceIdRule.required(),
});

export const deleteLeadSourceSchema = Joi.object({
  lead_source_id: leadSourceIdRule.required(),
});

export const updateLeadSourceIsActiveSchema = Joi.object({
  is_active: Joi.boolean().required(),
});

export default {
  createLeadSourceSchema,
  getLeadResourcesSchema,
  getLeadSourceByIdSchema,
  updateLeadSourceSchema,
  updateLeadSourceParamsSchema,
  deleteLeadSourceSchema,
  updateLeadSourceIsActiveSchema,
};
