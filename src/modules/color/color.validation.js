import Joi from "joi";
import { NAME_PATTERN, NAME_PATTERN_MESSAGE } from "../../utils/validationPatterns.js";

export const createColorSchema = Joi.object({
  color_name: Joi.string()
    .trim()
    .min(2)
    .max(255)
    .required()
    .pattern(NAME_PATTERN)
    .messages({
      "any.required": "Color name is required",
      "string.max": "Color name must not exceed 255 characters",
    }),
  sort_order: Joi.number().integer().default(1).messages({
    "number.base": "Sort order must be a number",
    "number.integer": "Sort order must be an integer",
  }),
  status: Joi.boolean().default(true).messages({
    "boolean.base": "Status must be a boolean",
  }),
  job_id: Joi.string().uuid().optional(),
});

export const updateColorSchema = Joi.object({
  color_name: Joi.string()
    .trim()
    .min(2)
    .max(255)
    .pattern(NAME_PATTERN)
    .optional()
    .messages({
      "string.max": "Color name must not exceed 255 characters",
    }),
  sort_order: Joi.number().integer().optional().messages({
    "number.base": "Sort order must be a number",
    "number.integer": "Sort order must be an integer",
  }),
  status: Joi.boolean().optional().messages({
    "boolean.base": "Status must be a boolean",
  }),
});

export const copyColorSchema = Joi.object({
  color_name: Joi.string()
    .trim()
    .min(2)
    .max(255)
    .required()
    .pattern(NAME_PATTERN)
    .messages({
      "any.required": "Color name is required",
      "string.max": "Color name must not exceed 255 characters",
    }),
  sort_order: Joi.number().integer().default(1).messages({
    "number.base": "Sort order must be a number",
    "number.integer": "Sort order must be an integer",
  }),
  job_id: Joi.string().uuid().optional(),
});

export default {
  createColorSchema,
  updateColorSchema,
  copyColorSchema,
};
