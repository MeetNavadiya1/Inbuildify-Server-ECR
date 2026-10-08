import Joi from "joi";

export const createClientTypeSchema = Joi.object({
  client_type: Joi.string()
    .trim()
    .min(2)
    .max(150)
    .required()
    .pattern(/^(?=.*[a-zA-Z])[a-zA-Z0-9\s,./#-]+$/)
    .messages({
      "string.empty": "client type is required",
      "any.required": "client type is required",
    }),

  sort_order: Joi.number().integer().min(1).optional().default(1).messages({
    "number.base": "Sort order must be a number",
    "number.min": "Sort order must be at least 1",
  }),

  is_active: Joi.boolean().optional(),
});

export const getAllClientTypeSchema = Joi.object({
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

export const deleteClientTypeSchema = Joi.object({
  id: Joi.string().uuid().required().messages({
    "string.guid": " ID must be a valid UUID",
    "any.required": " ID is required",
  }),
});

export const updateClientTypeParamsSchema = Joi.object({
  id: Joi.string().uuid().required().messages({
    "string.guid": " ID must be a valid UUID",
    "any.required": " ID is required",
  }),
});

export const updateClientTypeSchema = Joi.object({
  client_type: Joi.string()
    .trim()
    .min(2)
    .max(150)
    .optional()
    .pattern(/^(?=.*[a-zA-Z])[a-zA-Z0-9\s,./#-]+$/)
    .messages({
      "string.empty": "client type is can not be empty.",
    }),

  sort_order: Joi.number().integer().min(1).optional().messages({
    "number.base": "Sort order must be a number",
    "number.min": "Sort order must be at least 1",
  }),
});

export const updateClientTypeIsActiveSchema = Joi.object({
  is_active: Joi.boolean().required(),
});

export default {
  createClientTypeSchema,
  getAllClientTypeSchema,
  deleteClientTypeSchema,
  updateClientTypeParamsSchema,
  updateClientTypeSchema,
  updateClientTypeIsActiveSchema,
};
