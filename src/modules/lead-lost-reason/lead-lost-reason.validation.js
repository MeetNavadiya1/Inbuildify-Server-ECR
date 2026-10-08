import Joi from "joi";

export const createLeadLostReasonSchema = Joi.object({
  lost_reason: Joi.string()
    .trim()
    .max(255)
    .required()
    .pattern(/^(?=.*[a-zA-Z])[a-zA-Z0-9\s,./#-]+$/)
    .messages({
      "string.empty": "Lost reason is required",
      "any.required": "Lost reason is required",
    }),

  sort_order: Joi.number().integer().min(1).optional().default(1).messages({
    "number.base": "Sort order must be a number",
    "number.min": "Sort order must be at least 1",
  }),

  is_active: Joi.boolean().optional(),
});

export const getAllLeadLostReasonsSchema = Joi.object({
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

export const deleteLeadLostReasonSchema = Joi.object({
  id: Joi.string().uuid().required().messages({
    "string.guid": "Lead lost reasonID must be a valid UUID",
    "any.required": "Lead lost reason ID is required",
  }),
});

export const updateLeadLostReasonParamsSchema = Joi.object({
  id: Joi.string().uuid().required().messages({
    "string.guid": "Lead lost reasonID must be a valid UUID",
    "any.required": "Lead lost reason ID is required",
  }),
});

export const updateLeadLostReasonSchema = Joi.object({
  lost_reason: Joi.string()
    .trim()
    .max(255)
    .optional()
    .pattern(/^(?=.*[a-zA-Z])[a-zA-Z0-9\s,./#-]+$/)
    .messages({
      "string.empty": "Lost reason is can not be empty.",
    }),

  sort_order: Joi.number().integer().min(1).optional().messages({
    "number.base": "Sort order must be a number",
    "number.min": "Sort order must be at least 1",
  }),
});

export const updateLeadLostReasonIsActiveSchema = Joi.object({
  is_active: Joi.boolean().required(),
});

export default {
  createLeadLostReasonSchema,
  getAllLeadLostReasonsSchema,
  deleteLeadLostReasonSchema,
  updateLeadLostReasonParamsSchema,
  updateLeadLostReasonSchema,
  updateLeadLostReasonIsActiveSchema,
};
