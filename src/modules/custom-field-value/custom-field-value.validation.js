import Joi from "joi";

export const createCustomFieldValueSchema = Joi.object({
  custom_field_id: Joi.string().uuid().required().messages({
    "any.required": "custom field id is required",
  }),
  record_id: Joi.string().uuid().required().messages({
    "any.required": "Lead id is required",
  }),
  value_text: Joi.string().optional().allow(null, ""),
  value_number: Joi.number().optional().allow(null),
  value_date: Joi.date().optional().allow(null),
  value_boolean: Joi.boolean().optional().allow(null),
  value_list: Joi.string().optional().allow(null, ""),
});

export const getAllCustomFieldValueSchema = Joi.object({
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

export const deleteCustomFieldValueSchema = Joi.object({
  custom_field_value_id: Joi.string().uuid().required().messages({
    "string.guid": "ID must be a valid UUID",
    "any.required": "ID is required",
  }),
});

export const updateCustomFieldValueIdParamsSchema = Joi.object({
  custom_field_value_id: Joi.string().uuid().required().messages({
    "string.guid": "ID must be a valid UUID",
    "any.required": "ID is required",
  }),
});

export const updateCustomFieldValueSchema = Joi.object({
  custom_field_id: Joi.string().uuid().optional().messages({
    "string.guid": "custom field value ID must be a valid UUID",
  }),

  record_id: Joi.string().uuid().optional().messages({
    "string.guid": "record ID must be a valid UUID",
  }),
  value_text: Joi.string().optional().allow(null, ""),
  value_number: Joi.number().optional().allow(null).messages({
    "number.base": "Enter a valid number.",
  }),
  value_date: Joi.date().optional().allow(null),
  value_boolean: Joi.boolean().optional().allow(null).messages({
    "boolean.base": "Enter a valid boolean value (true or false).",
  }),
  value_list: Joi.string().optional().allow(null, ""),
}).or(
  "record_id",
  "custom_field_id",
  "value_text",
  "value_number",
  "value_date",
  "value_boolean",
  "value_list",
);

export default {
  createCustomFieldValueSchema,
  getAllCustomFieldValueSchema,
  deleteCustomFieldValueSchema,
  updateCustomFieldValueSchema,
  updateCustomFieldValueIdParamsSchema,
};
