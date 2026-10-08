import Joi from "joi";

export const createRolePermissionSchema = Joi.object({
  role_id: Joi.string().uuid().required().messages({
    "string.guid": "Role id must be a valid UUID",
    "any.required": "Role id is required",
  }),
  module_name: Joi.string().min(2).max(100).required().messages({
    "string.empty": "Module name is required",
    "any.required": "Module name is required",
  }),

  can_create: Joi.boolean().default(false),
  can_read: Joi.boolean().default(false),
  can_update: Joi.boolean().default(false),
  can_delete: Joi.boolean().default(false),

  is_active: Joi.boolean().default(true),
});

export const getAllRolePermissionSchema = Joi.object({
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

export const deleteRolePermissionSchema = Joi.object({
  id: Joi.string().uuid().required().messages({
    "string.guid": "Role permission id must be a valid UUID",
    "any.required": "Role permission id is required",
  }),
});

export const updatePermissionIdSchemaSchema = Joi.object({
  role_permission_id: Joi.string().uuid().required().messages({
    "string.guid": "Role permission id must be a valid UUID",
    "any.required": "Role permission id is required",
  }),
});

export const updateRolePermissionSchema = Joi.object({
  role_id: Joi.string().uuid().optional().messages({
    "string.guid": "Role id must be a valid UUID",
  }),
  module_name: Joi.string().min(2).max(100).optional().messages({
    "string.empty": "Module name can not be empty.",
  }),

  can_create: Joi.boolean().default(false),
  can_read: Joi.boolean().default(false),
  can_update: Joi.boolean().default(false),
  can_delete: Joi.boolean().default(false),
});

export const updateRolePermissionIsActiveSchema = Joi.object({
  is_active: Joi.boolean().required(),
});

export default {
  createRolePermissionSchema,
  getAllRolePermissionSchema,
  deleteRolePermissionSchema,
  updatePermissionIdSchemaSchema,
  updateRolePermissionSchema,
  updateRolePermissionIsActiveSchema,
};
