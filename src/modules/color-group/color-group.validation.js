import Joi from "joi";
import { NAME_PATTERN, NAME_PATTERN_MESSAGE } from "../../utils/validationPatterns.js";

export const createColorGroupSchema = Joi.object({
  name: Joi.string()
    .required()
    .trim()
    .min(2)
    .max(255)
    .pattern(NAME_PATTERN)
    .messages({
      "any.required": "Color group name is required",
      "string.max": "Color group name must not exceed 255 characters",
      "string.empty": "Color group name cannot be empty",
    }),
});

export const getAllColorGroupsSchema = Joi.object({
  page: Joi.number().integer().min(1).optional().messages({
    "number.base": "Page must be a number",
    "number.integer": "Page must be an integer",
    "number.min": "Page must be greater than 0",
  }),

  limit: Joi.number().integer().min(1).max(100).optional().messages({
    "number.base": "Limit must be a number",
    "number.integer": "Limit must be an integer",
    "number.min": "Limit must be at least 1",
    "number.max": "Limit must not exceed 100",
  }),

  status: Joi.boolean().optional().messages({
    "any.only": "Status must be either 'true' or 'false'",
  }),

  search: Joi.string().trim().max(255).allow("").optional().messages({
    "string.max": "Search term must not exceed 255 characters",
  }),
});

export const getColorGroupByIdSchema = Joi.object({
  colorGroupId: Joi.string().uuid().required().messages({
    "any.required": "Color group ID is required",
    "string.uuid": "Color group ID must be a valid UUID",
    "string.guid": "Color group ID must be a valid UUID",
  }),
});

export const updateColorGroupParamsSchema = Joi.object({
  colorGroupId: Joi.string().uuid().required().messages({
    "any.required": "Color group ID is required",
    "string.uuid": "Color group ID must be a valid UUID",
    "string.guid": "Color group ID must be a valid UUID",
  }),
});

export const updateColorGroupSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(2)
    .max(255)
    .optional()
    .pattern(NAME_PATTERN)
    .messages({
      "string.max": "Color group name must not exceed 255 characters",
      "string.empty": "Color group name cannot be empty if provided",
    }),

  status: Joi.boolean().optional().messages({
    "boolean.base": "Status must be a boolean value",
  }),
})
  .min(1)
  .messages({
    "object.min": "At least one field is required to update",
  });

export const deleteColorGroupSchema = Joi.object({
  colorGroupId: Joi.string().uuid().required().messages({
    "any.required": "Color group ID is required",
    "string.uuid": "Color group ID must be a valid UUID",
    "string.guid": "Color group ID must be a valid UUID",
  }),
});

export default {
  createColorGroupSchema,
  getAllColorGroupsSchema,
  getColorGroupByIdSchema,
  updateColorGroupParamsSchema,
  updateColorGroupSchema,
  deleteColorGroupSchema,
};
