import Joi from "joi";

export const createUserRoleMappingSchema = Joi.object({
  role_type_id: Joi.string().uuid().optional().messages({
    "string.guid": "user ID must be a valid UUID",
  }),

  user_id: Joi.string().uuid().optional().messages({
    "string.guid": "user ID must be a valid UUID",
  }),

  role_id: Joi.string().uuid().required().messages({
    "string.guid": "role ID must be a valid UUID",
    "any.required": "role ID is required",
  }),

  assigned_by: Joi.string().uuid().optional().messages({
    "string.guid": "assignedBy ID must be a valid UUID",
  }),
});

export const getAllUserRoleMappingSchema = Joi.object({
  assigned_by: Joi.string().uuid().optional().messages({
    "string.guid": "role ID must be a valid UUID",
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

export const updateUserRoleMppingParamsSchema = Joi.object({
  user_role_mapping_id: Joi.string().uuid().required().messages({
    "string.guid": "user role mapping ID must be a valid UUID",
    "any.required": "user role mapping ID is required",
  }),
});

export const updateUserRoleMappingSchema = Joi.object({
  role_type_id: Joi.string().uuid().optional().messages({
    "string.guid": "role type ID must be a valid UUID",
  }),

  user_id: Joi.string().uuid().optional().messages({
    "string.guid": "user ID must be a valid UUID",
  }),

  role_id: Joi.string().uuid().optional().messages({
    "string.guid": "role ID must be a valid UUID",
  }),

  assigned_by: Joi.string().uuid().optional().messages({
    "string.guid": "assignedBy ID must be a valid UUID",
  }),
});

export default {
  createUserRoleMappingSchema,
  getAllUserRoleMappingSchema,
  updateUserRoleMppingParamsSchema,
  updateUserRoleMappingSchema,
};
