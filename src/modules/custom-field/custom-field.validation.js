import Joi from "joi";

export const createCustomFieldSchema = Joi.object({
  module_id: Joi.string().uuid().required().messages({
    "string.guid": "Custom field module ID must be a valid UUID",
    "any.required": "Custom field module ID is required",
  }),
  field_name: Joi.string().trim().min(2).max(150).required().messages({
    "string.empty": "Field name is required.",
    "any.required": "Field name is required.",
  }),

  field_type: Joi.string()
    .valid("text", "number", "date", "checkbox", "list", "multiline")
    .required()
    .max(50)
    .messages({
      "any.only":
        "Invalid field_type. Must be one of: text, number, date, checkbox, list, multiline.",
      "any.required": "Field type is required.",
    }),

  sort_order: Joi.number().integer().min(1).default(0),

  is_active: Joi.boolean().default(true),
});

export const getAllCustomFieldSchema = Joi.object({
  module_id: Joi.string().uuid().optional().messages({
    "string.guid": "Custom field module ID must be a valid UUID",
    "any.required": "Custom field module ID is required",
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

export const deleteCustomFieldSchema = Joi.object({
  id: Joi.string().uuid().required().messages({
    "string.guid": "Custom field ID must be a valid UUID",
    "any.required": "Custom field ID is required",
  }),
});

export const updateCustomFieldIdParamsSchema = Joi.object({
  id: Joi.string().uuid().required().messages({
    "string.guid": "Custom field ID must be a valid UUID",
    "any.required": "Custom field ID is required",
  }),
});

export const updateCustomFieldSchema = Joi.object({
  field_name: Joi.string().trim().max(150).optional(),

  field_type: Joi.string()
    .max(50)
    .valid("text", "number", "date", "checkbox", "list", "multiline")
    .optional(),

  sort_order: Joi.number().integer().min(1).optional(),
});

export const updateCustomFieldIsActiveSchema = Joi.object({
  is_active: Joi.boolean().required(),
});

export const createOptionSchema = Joi.object({
  custom_field_id: Joi.string().uuid().required().messages({
    "string.guid": "Custom field ID must be a valid UUID",
    "any.required": "Custom field ID is required",
  }),

  options: Joi.array()
    .items(
      Joi.string().trim().min(1).messages({
        "string.empty": "Option value cannot be empty.",
      }),
    )
    .min(1)
    .max(1)
    .required()
    .unique((a, b) => a.toLowerCase() === b.toLowerCase())
    .messages({
      "array.base": "options must be an array.",
      "array.min": "At least one option is required.",
      "array.unique": "Duplicate options are not allowed.",
      "any.required": "options is required.",
    }),
});

export const deleteOptionParamsSchema = Joi.object({
  custom_field_id: Joi.string().uuid().required().messages({
    "string.guid": "Custom field ID must be a valid UUID",
    "any.required": "Custom field ID is required",
  }),
});
export const deleteOptionSchema = Joi.object({
  options: Joi.array().items(Joi.string().trim().min(1)).min(1).required(),
});

export default {
  createCustomFieldSchema,
  getAllCustomFieldSchema,
  deleteCustomFieldSchema,
  updateCustomFieldIdParamsSchema,
  updateCustomFieldSchema,
  updateCustomFieldIsActiveSchema,
  createOptionSchema,
  deleteOptionParamsSchema,
  deleteOptionSchema,
};
