import Joi from "joi";
import { NAME_PATTERN, NAME_PATTERN_MESSAGE } from "../../utils/validationPatterns.js";

export const createJobColorCoulmnSchema = Joi.object({
  column_name: Joi.string()
    .trim()
    .min(2)
    .max(150)
    .pattern(NAME_PATTERN)
    .required(),
  display_option: Joi.string()
    .max(50)
    .valid(
      "dont_show",
      "show_as_separate_column",
      "show_in_existing_items_column",
    )
    .required(),
  sort_order: Joi.number().integer().optional().allow(null),
  width: Joi.number().integer().optional().allow(null),
});

export const getJobColorColumnSchema = Joi.object({
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

export const updateJobColorColumnParamsSchema = Joi.object({
  id: Joi.string().uuid().required().messages({
    "string.guid": "Job color column id must be a valid UUID",
    "any.required": "Job color column id is required",
  }),
});

export const updateJobColorColumnSchema = Joi.object({
  column_name: Joi.string()
    .trim()
    .min(2)
    .max(150)
    .pattern(NAME_PATTERN)
    .optional(),
  display_option: Joi.string()
    .max(50)
    .valid(
      "dont_show",
      "show_as_separate_column",
      "show_in_existing_items_column",
    )
    .optional(),
  sort_order: Joi.number().integer().optional(),
  width: Joi.number().integer().optional(),
});

export default {
  createJobColorCoulmnSchema,
  getJobColorColumnSchema,
  updateJobColorColumnParamsSchema,
  updateJobColorColumnSchema,
};
