import Joi from "joi";

export const createUserPasswordHistorySchema = Joi.object({
  old_password: Joi.string().min(6).max(255).required().messages({
    "any.required": "Password is required",
    "string.base": "Password must be a string",
    "string.empty": "Password is required",
    "string.min": "Password must be at least 6 characters long",
    "string.max": "Password must not exceed 100 characters",
  }),
});

export const getAllUserPasswordHistorySchema = Joi.object({
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

export const deleteUserPasswordHistorySchema = Joi.object({
  id: Joi.string().uuid().required().messages({
    "string.guid": "history ID must be a valid UUID",
    "any.required": "history ID is required",
  }),
});

export const getUserPasswordHistoryByIdSchema = Joi.object({
  id: Joi.string().uuid().required().messages({
    "string.guid": "history ID must be a valid UUID",
    "any.required": "history ID is required",
  }),
});

export const deleteUserPasswordHistoryByUserIdSchema = Joi.object({
  user_id: Joi.string().uuid().required().messages({
    "string.guid": "user ID must be a valid UUID",
    "any.required": "user ID is required",
  }),
});

export default {
  createUserPasswordHistorySchema,
  getAllUserPasswordHistorySchema,
  deleteUserPasswordHistorySchema,
  getUserPasswordHistoryByIdSchema,
  deleteUserPasswordHistoryByUserIdSchema,
};
