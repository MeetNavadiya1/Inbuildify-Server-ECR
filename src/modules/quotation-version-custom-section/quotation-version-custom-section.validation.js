import Joi from "joi";

export const createCustomSectionSchema = Joi.object({
  quotation_version_id: Joi.string().uuid().required().messages({
    "string.guid": "Quotation Version ID must be a valid UUID",
    "any.required": "Quotation Version ID is required",
  }),
  file_url: Joi.string().max(500).optional().allow(null, "").messages({
    "string.max": "File URL must not exceed 500 characters",
  }),
  sort_order: Joi.number().integer().optional().allow(null).messages({
    "number.base": "Sort order must be a number",
    "number.integer": "Sort order must be an integer",
  }),
});

export const getCustomSectionsByVersionSchema = Joi.object({
  quotation_version_id: Joi.string().uuid().required().messages({
    "string.guid": "Quotation Version ID must be a valid UUID",
    "any.required": "Quotation Version ID is required",
  }),
});

export const updateCustomSectionSchema = Joi.object({
  file_url: Joi.string().max(500).optional().allow(null, "").messages({
    "string.max": "File URL must not exceed 500 characters",
  }),
  sort_order: Joi.number().integer().optional().allow(null).messages({
    "number.base": "Sort order must be a number",
    "number.integer": "Sort order must be an integer",
  }),
});

export const customSectionIdParamsSchema = Joi.object({
  custom_section_id: Joi.string().uuid().required().messages({
    "string.guid": "Custom Section ID must be a valid UUID",
    "any.required": "Custom Section ID is required",
  }),
});

export default {
  createCustomSectionSchema,
  getCustomSectionsByVersionSchema,
  updateCustomSectionSchema,
  customSectionIdParamsSchema,
};
