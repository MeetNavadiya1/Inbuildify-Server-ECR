import Joi from "joi";

const headerRule = Joi.string().uuid().optional().messages({
  "string.guid": "header ID must be a valid UUID",
});

const valueRule = Joi.string().max(255).optional().allow(null, "").messages({
  "string.max": "value must be less than or equal to 255 characters.",
});

export const createIntegrationCustomFieldItemSchema = Joi.object({
  header1_id: headerRule,
  header2_id: headerRule,

  value1: valueRule,
  value2: valueRule,

  assignee_user_id: Joi.string().uuid().optional().allow(null, "").messages({
    "string.guid": "assignee_user_id must be a valid UUID.",
  }),
  sort_order: Joi.number().integer().min(0).default(0).messages({
    "number.base": "sort_order must be a number.",
    "number.integer": "sort_order must be an integer.",
    "number.min": "sort_order must be greater than or equal to 0.",
  }),
  is_active: Joi.boolean().default(true).messages({
    "boolean.base": "is_active must be a boolean.",
  }),
});

export const getAllIntegrationCustomFieldItemSchema = Joi.object({
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

export const deleteIntegrationCustomFieldItemSchema = Joi.object({
  integration_custom_field_item_id: Joi.string().uuid().required().messages({
    "string.guid": "integration custom field item ID must be a valid UUID",
    "any.required": "integration custom field item ID is required",
  }),
});

export const updateIntegrationCustomFieldParamsSchema = Joi.object({
  integration_custom_field_item_id: Joi.string().uuid().required().messages({
    "string.guid": "integration custom field item ID must be a valid UUID",
    "any.required": "integration custom field item ID is required",
  }),
});

export const updateIntegrationCustoFieldItemSchema = Joi.object({
  header1_id: headerRule,
  header2_id: headerRule,

  value1: valueRule,
  value2: valueRule,

  assignee_user_id: Joi.string().uuid().optional().allow(null, "").messages({
    "string.guid": "assignee_user_id must be a valid UUID.",
  }),
  sort_order: Joi.number().integer().min(0).messages({
    "number.base": "sort_order must be a number.",
    "number.integer": "sort_order must be an integer.",
    "number.min": "sort_order must be greater than or equal to 0.",
  }),
});

export const updateIntegrationCustomFieldItemIsActiveSchema = Joi.object({
  is_active: Joi.boolean().required(),
});

export default {
  createIntegrationCustomFieldItemSchema,
  getAllIntegrationCustomFieldItemSchema,
  deleteIntegrationCustomFieldItemSchema,
  updateIntegrationCustoFieldItemSchema,
  updateIntegrationCustomFieldParamsSchema,
  updateIntegrationCustomFieldItemIsActiveSchema,
};
