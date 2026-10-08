import Joi from "joi";

export const createChecklistItemSchema = Joi.object({
  construction_type_id: Joi.string().uuid().required().messages({
    "any.required": "construction type ID is required",
    "string.guid": "construction type ID must be a valid UUID",
  }),

  construction_stage_id: Joi.string().uuid().required().messages({
    "any.required": "construction stage ID is required",
    "string.guid": "construction stage ID must be a valid UUID",
  }),
  checklist_id: Joi.string().uuid().required().messages({
    "any.required": "Checklist ID is required",
    "string.guid": "Checklist ID must be a valid UUID",
  }),
  description: Joi.string().max(500).required().messages({
    "any.required": "Description is required",
    "string.max": "Description cannot exceed 500 characters",
  }),
  notes: Joi.boolean().default(false),
  is_required: Joi.boolean().default(false),
  type: Joi.string().valid("checkbox", "dropdown").required().messages({
    "any.required": "Type is required",
    "any.only": "Type must be either 'checkbox' or 'dropdown'",
  }),
  sort: Joi.number().integer().min(1).required().messages({
    "any.required": "Sort is required",
    "number.base": "Sort must be a number",
    "number.integer": "Sort must be an integer",
    "number.min": "Sort must be at least 1",
  }),
});

export const getAllChecklistItemSchema = Joi.object({
  sortOrder: Joi.string()
    .valid("asc", "desc")
    .insensitive()
    .optional()
    .messages({
      "any.only": "Order must be either 'asc' or 'desc'.",
      "string.base": "Order must be a string.",
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

export const getChecklistItemsByChecklistIdSchema = Joi.object({
  checklist_id: Joi.string().uuid().required().messages({
    "string.guid": "checklist ID must be a valid UUID",
    "any.required": "checklist ID is required",
  }),
});

export const deleteChecklistItemSchema = Joi.object({
  checklist_item_id: Joi.string().uuid().required().messages({
    "string.guid": "checklist item ID must be a valid UUID",
    "any.required": "checklist item ID is required",
  }),
});

export const updateChecklistItemParamsSchema = Joi.object({
  checklist_item_id: Joi.string().uuid().required().messages({
    "string.guid": "checklist item ID must be a valid UUID",
    "any.required": "checklist item ID is required",
  }),
});

export const updateChecklistItemSchema = Joi.object({
  checklist_id: Joi.string().uuid().optional().messages({
    "string.guid": "Checklist ID must be a valid UUID",
  }),
  description: Joi.string().max(500).optional().messages({
    "string.max": "Description cannot exceed 500 characters",
  }),
  notes: Joi.boolean().optional(),
  is_required: Joi.boolean().optional(),
  type: Joi.string().valid("checkbox", "dropdown").optional().messages({
    "any.only": "Type must be either 'checkbox' or 'dropdown'",
  }),
  sort: Joi.number().integer().min(1).optional().messages({
    "any.required": "Sort is required",
    "number.base": "Sort must be a number",
    "number.integer": "Sort must be an integer",
    "number.min": "Sort must be at least 1",
  }),
});

export default {
  createChecklistItemSchema,
  getAllChecklistItemSchema,
  getChecklistItemsByChecklistIdSchema,
  deleteChecklistItemSchema,
  updateChecklistItemParamsSchema,
  updateChecklistItemSchema,
};
