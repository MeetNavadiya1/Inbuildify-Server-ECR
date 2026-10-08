import Joi from "joi";

export const createSupplierTypeMapSchema = Joi.object({
  supplier_id: Joi.string().uuid().required().messages({
    "string.guid": "Supplier ID must be a valid UUID",
    "any.required": "Supplier ID is required",
  }),

  supplier_type_id: Joi.string().uuid().required().messages({
    "string.guid": "Supplier type ID must be a valid UUID",
    "any.required": "Supplier type ID is required",
  }),
});

export const getAllSupplierTypeMapsSchema = Joi.object({
  supplier_type_id: Joi.string().uuid().optional().messages({
    "string.guid": "Supplier type ID must be a valid UUID",
    "any.required": "Supplier type ID is required",
  }),
});

export const deleteSupplierSupplierTypeMapSchema = Joi.object({
  id: Joi.string().uuid().required().messages({
    "string.guid": "Supplier type map ID must be a valid UUID",
    "any.required": "Supplier type map ID is required",
  }),
});

export const updateSupplierTypeParamsSchema = Joi.object({
  id: Joi.string().uuid().required().messages({
    "string.guid": "Supplier type map ID must be a valid UUID",
    "any.required": "Supplier type map ID is required",
  }),
});

export const updateSupplierTypeMapSchema = Joi.object({
  assign_to_new_and_existing_checklist: Joi.boolean().optional(),
});

export const createSupplierTpeChecklistSchema = Joi.object({
  supplier_type_id: Joi.string().uuid().required().messages({
    "string.guid": "Supplier type ID must be a valid UUID",
    "any.required": "Supplier type ID is required",
  }),

  construction_checklist_id: Joi.string().uuid().required().messages({
    "string.guid": "Construction checklist id must be a valid UUID",
    "any.required": "construction checklist id is required",
  }),
});

export default {
  createSupplierTypeMapSchema,
  getAllSupplierTypeMapsSchema,
  deleteSupplierSupplierTypeMapSchema,
  updateSupplierTypeParamsSchema,
  updateSupplierTypeMapSchema,
  createSupplierTpeChecklistSchema,
};
