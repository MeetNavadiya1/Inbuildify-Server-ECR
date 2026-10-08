import Joi from "joi";

export const createUserGroupSchema = Joi.object({
  users_id: Joi.array()
    .items(Joi.string().uuid())
    .default([])
    .optional()
    .messages({
      "string.guid": "user ID must be a valid UUID",
    }),
  name: Joi.string().trim().max(100).required().messages({
    "string.empty": "Group name is required.",
    "string.max": "Group name must be at most 100 characters long.",
    "any.required": "Group name is required.",
  }),

  is_active: Joi.boolean().default(true).messages({
    "boolean.base": "is_active must be a boolean value (true/false).",
  }),
});
export const getAllUserGroupSchema = Joi.object({
  is_active: Joi.boolean().optional(),
  search: Joi.string().trim().allow("").optional(),

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

export const updateUserGroupParamsSchema = Joi.object({
  user_group_id: Joi.string().uuid().required().messages({
    "string.guid": "user group ID must be a valid UUID",
    "any.required": "user group ID is required",
  }),
});

export const updateUserGroupSchema = Joi.object({
  name: Joi.string().trim().max(100).optional().messages({
    "string.max": "Group name must be at most 100 characters long.",
  }),
  users_id: Joi.array()
    .items(Joi.string().uuid())
    .default([])
    .optional()
    .messages({
      "string.guid": "user ID must be a valid UUID",
    }),
  is_active: Joi.boolean().optional(),
});

export default {
  createUserGroupSchema,
  getAllUserGroupSchema,
  updateUserGroupParamsSchema,
  updateUserGroupSchema,
};
