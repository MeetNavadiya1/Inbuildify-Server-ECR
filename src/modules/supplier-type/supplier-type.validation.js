import Joi from "joi";
import { NAME_PATTERN, NAME_PATTERN_MESSAGE } from "../../utils/validationPatterns.js";

export const createSuppllierTypeSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(2)
    .max(150)
    .pattern(NAME_PATTERN)
    .required()
    .messages({
      "any.required": "name is required",
    }),
  is_active: Joi.boolean().default(true),
});

export const getAllSupllierTypeSchema = Joi.object({
  is_active: Joi.boolean().optional(),
  name: Joi.string().max(150).optional(),
});

export const deleteSupplierTypeSchema = Joi.object({
  supplier_type_id: Joi.string().uuid().required().messages({
    "string.guid": " ID must be a valid UUID",
    "any.required": " ID is required",
  }),
});

export const updateSupplierTypeParamsSchema = Joi.object({
  supplier_type_id: Joi.string().uuid().required().messages({
    "string.guid": "supplier type ID must be a valid UUID",
    "any.required": " supplier type ID is required",
  }),
});

export const updateSupplierTypeSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(2)
    .max(150)
    .pattern(NAME_PATTERN)
    .optional(),
  is_active: Joi.boolean().optional(),
});

export default {
  createSuppllierTypeSchema,
  getAllSupllierTypeSchema,
  deleteSupplierTypeSchema,
  updateSupplierTypeParamsSchema,
  updateSupplierTypeSchema,
};
