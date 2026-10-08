import Joi from "joi";
import { NAME_PATTERN, NAME_PATTERN_MESSAGE } from "../../utils/validationPatterns.js";

export const createTemplateEmailSchema = Joi.object({
  name: Joi.string()
    .min(2)
    .max(200)
    .pattern(NAME_PATTERN)
    .required()
    .messages({
      "string.pattern.base": NAME_PATTERN_MESSAGE,
      "any.required": "Template name is required.",
    }),
  type: Joi.string()
    .max(50)
    .valid("standard", "customized")
    .default("standard"),
  subject: Joi.string().min(2).max(255).optional(),
  email_content: Joi.string().required().messages({
    "string.pattern.base": "Email content must contain at least one letter",
    "any.required": "Email content is required.",
  }),
  additional_recipient_users: Joi.array()
    .items(Joi.string().uuid())
    .default([])
    .messages({
      "string.guid": "Additional recipient users ID must be a valid UUID",
    }),
  additional_recipient_groups: Joi.array()
    .items(Joi.string().uuid())
    .default([])
    .messages({
      "string.guid": "Additional recipient group ID must be a valid UUID",
    }),
  is_active: Joi.boolean().default(true),
});

export const getAllTemplateEmailSchema = Joi.object({
  name: Joi.string().max(200).optional(),
  type: Joi.string().max(100).valid("standard", "customized").optional(),
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

export const updateTemplateEmailParamsSchema = Joi.object({
  id: Joi.string().uuid().required().messages({
    "string.guid": "template email ID must be a valid UUID",
    "any.required": "template email ID is required",
  }),
});

export const updateTemplateEmailSchem = Joi.object({
  subject: Joi.string().allow(null, "").max(255).optional(),
  email_content: Joi.string().optional(),
  additional_recipient_users: Joi.array()
    .items(Joi.string().uuid())
    .default([])
    .messages({
      "string.guid": "Additional recipient users ID must be a valid UUID",
    }),
  additional_recipient_groups: Joi.array()
    .items(Joi.string().uuid())
    .default([])
    .messages({
      "string.guid": "Additional recipient group ID must be a valid UUID",
    }),
});

export const deleteTemplateEmailSchema = Joi.object({
  template_email_id: Joi.string().uuid().required().messages({
    "string.guid": "template email ID must be a valid UUID",
    "any.required": "template email ID is required",
  }),
});

export const updateTemplateEmailIsActiveSchema = Joi.object({
  is_active: Joi.boolean().required(),
});

export default {
  createTemplateEmailSchema,
  getAllTemplateEmailSchema,
  updateTemplateEmailParamsSchema,
  updateTemplateEmailSchem,
  deleteTemplateEmailSchema,
  updateTemplateEmailIsActiveSchema,
};
