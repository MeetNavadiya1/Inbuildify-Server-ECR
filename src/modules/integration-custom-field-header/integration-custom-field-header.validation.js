import Joi from "joi";

export const createIntegrationCustomFieldHeaderSchema = Joi.object({
  header_name: Joi.string().trim().min(1).max(150).required(),
});

export const getAllIntegrationCustomFieldHeaderSchema = Joi.object({
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

export const deleteIntegrationCustomFieldHeaderSchema = Joi.object({
  integration_custom_field_header_id: Joi.string().uuid().required().messages({
    "string.guid": "integration custom field header ID must be a valid UUID",
    "any.required": "integration custom field header ID is required",
  }),
});

export const updateIntegrationCustomFieldHeaderParamsSchema = Joi.object({
  integration_custom_field_header_id: Joi.string().uuid().required().messages({
    "string.guid": "integration custom field header ID must be a valid UUID",
    "any.required": "integration custom field header ID is required",
  }),
});

export const updateIntegrationCustomFieldHeaderSchem = Joi.object({
  header_name: Joi.string().trim().min(1).max(150).optional(),
});

export default {
  createIntegrationCustomFieldHeaderSchema,
  getAllIntegrationCustomFieldHeaderSchema,
  deleteIntegrationCustomFieldHeaderSchema,
  updateIntegrationCustomFieldHeaderParamsSchema,
  updateIntegrationCustomFieldHeaderSchem,
};
