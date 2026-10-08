import Joi from "joi";

// ============================================================
//        CUSTOM SECTION VALIDATION SCHEMAS
// ============================================================

export const createCustomSectionSchema = Joi.object({
  field_name: Joi.string().max(255).required().messages({
    "string.empty": "Field name is required.",
    "string.max": "Field name must not exceed 255 characters.",
    "any.required": "Field name is required.",
  }),
  field_label: Joi.string().max(255).required().messages({
    "string.empty": "Field label is required.",
    "string.max": "Field label must not exceed 255 characters.",
    "any.required": "Field label is required.",
  }),
  is_applicable: Joi.boolean().optional().default(false).messages({
    "boolean.base": "is_applicable must be a boolean value.",
  }),
  group_field: Joi.boolean().optional().default(false).messages({
    "boolean.base": "group_field must be a boolean value.",
  }),
  sort_order: Joi.number().integer().optional().messages({
    "number.base": "Sort order must be a number",
    "number.integer": "Sort order must be an integer",
  }),
  parent_field: Joi.string()
    .valid("Facade Name", "Property Address", "Client Email", "Client Mobile")
    .optional()
    .allow(null)
    .messages({
      "any.only": "Parent field must be one of the allowed values.",
    }),
 
});

export const updateCustomSectionSchema = Joi.object({
  field_name: Joi.string().max(255).optional().messages({
    "string.max": "Field name must not exceed 255 characters.",
  }),
  field_label: Joi.string().max(255).optional().messages({
    "string.max": "Field label must not exceed 255 characters.",
  }),
  is_applicable: Joi.boolean().optional().messages({
    "boolean.base": "is_applicable must be a boolean value.",
  }),
  group_field: Joi.boolean().optional().messages({
    "boolean.base": "group_field must be a boolean value.",
  }),
  sort_order: Joi.number().integer().optional().messages({
    "number.base": "Sort order must be a number",
    "number.integer": "Sort order must be an integer",
  }),
  parent_field: Joi.string()
    .valid("Facade Name", "Property Address", "Client Email", "Client Mobile")
    .optional()
    .allow(null)
    .messages({
      "any.only": "Parent field must be one of the allowed values.",
    }),
 
})
  .min(1)
  .messages({
    "object.min": "At least one field must be provided for update.",
  });

export const getCustomSectionSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1).messages({
    "number.base": "Page must be a number",
    "number.integer": "Page must be an integer",
    "number.min": "Page must be greater than 0",
  }),
  limit: Joi.number().integer().min(1).max(100).default(25).messages({
    "number.base": "Limit must be a number",
    "number.integer": "Limit must be an integer",
    "number.min": "Limit must be at least 1",
    "number.max": "Limit must not exceed 100",
  }),
  search: Joi.string().max(255).optional().messages({
    "string.max": "Search term must not exceed 255 characters.",
  }),
 
});

export const paramsCustomSectionIdSchema = Joi.object({
  custom_section_id: Joi.string().uuid().required().messages({
    "string.guid": "Custom section ID must be a valid UUID",
    "any.required": "Custom section ID is required",
  }),
});

export const paramsQuotationFormatIdSchema = Joi.object({
  quotation_format_id: Joi.string().uuid().required().messages({
    "string.guid": "Quotation format ID must be a valid UUID",
    "any.required": "Quotation format ID is required",
  }),
});

export default {
  createCustomSectionSchema,
  updateCustomSectionSchema,
  getCustomSectionSchema,
  paramsCustomSectionIdSchema,
  paramsQuotationFormatIdSchema,
};
