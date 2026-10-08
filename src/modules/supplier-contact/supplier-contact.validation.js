import Joi from "joi";
import { NAME_PATTERN, NAME_PATTERN_MESSAGE } from "../../utils/validationPatterns.js";

export const createSupplierContactSchema = Joi.object({
  supplier_id: Joi.string().uuid().required().messages({
    "string.guid": "Supplier ID must be a valid UUID",
    "any.required": "Supplier ID is required",
  }),
  contact_name: Joi.string()
    .trim()
    .min(2)
    .max(150)
    .pattern(NAME_PATTERN)
    .required(),
  email: Joi.string().trim().lowercase().max(150).email(),

  phone: Joi.string()
    .pattern(/^[0-9+\-\s()]*$/)
    .min(10)
    .max(14)
    .allow(null, "")
    .messages({
      "string.pattern.base":
        "Secondery phone can only contain numbers, spaces, +, -, and parentheses",
    }),
  contact_type: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .pattern(/^[^<>]*$/)
    .optional(),
});

export const getAllSupplierContactsSchema = Joi.object({
  supplier_id: Joi.string().uuid().optional().messages({
    "string.guid": "Supplier ID must be a valid UUID",
    "any.required": "Supplier ID is required",
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

export const deleteSupplierContactSchema = Joi.object({
  supplier_contact_id: Joi.string().uuid().required().messages({
    "string.guid": "supplier contact ID must be a valid UUID",
    "any.required": " supplier contact ID is required",
  }),
});

export const updateSupplierContactParamsSchema = Joi.object({
  supplier_contact_id: Joi.string().uuid().required().messages({
    "string.guid": "supplier contact ID must be a valid UUID",
    "any.required": " supplier contact ID is required",
  }),
});

export const updateSupplierContactSchema = Joi.object({
  contact_name: Joi.string()
    .trim()
    .min(2)
    .max(150)
    .pattern(NAME_PATTERN)
    .optional(),
  email: Joi.string().trim().lowercase().max(150).email().optional(),

  phone: Joi.string()
    .pattern(/^[0-9+\-\s()]*$/)
    .min(10)
    .max(14)
    .allow(null, "")
    .optional()
    .optional()
    .messages({
      "string.pattern.base":
        "Secondery phone can only contain numbers, spaces, +, -, and parentheses",
    }),
  contact_type: Joi.string()
    .trim()
    .pattern(/^[^<>]*$/)
    .max(100)
    .optional(),
});

export default {
  createSupplierContactSchema,
  getAllSupplierContactsSchema,
  deleteSupplierContactSchema,
  updateSupplierContactParamsSchema,
  updateSupplierContactSchema,
};
