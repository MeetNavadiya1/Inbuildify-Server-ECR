import Joi from "joi";

export const createCustomFieldModuleSchema = Joi.object({
  name: Joi.string().trim().min(3).max(50).optional(),
  description: Joi.string().trim().max(500).optional(),
});

export const deleteCustomFieldModuleSchema = Joi.object({
  module_id: Joi.string().uuid().required().messages({
    "string.guid": "ID must be a valid UUID",
    "any.required": "ID is required",
  }),
});

export const getAllCustomFieldModuleSchema = Joi.object({
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

export const updateCustomFieldModuleIdParamsSchema = Joi.object({
  module_id: Joi.string().uuid().required().messages({
    "string.guid": "ID must be a valid UUID",
    "any.required": "ID is required",
  }),
});

export const updateCustomFieldModuleSchema = Joi.object({
  name: Joi.string().trim().min(3).max(50).optional(),
  description: Joi.string().trim().max(500).optional(),
});

export default {
  createCustomFieldModuleSchema,
  getAllCustomFieldModuleSchema,
  deleteCustomFieldModuleSchema,
  updateCustomFieldModuleIdParamsSchema,
  updateCustomFieldModuleSchema,
};
