import Joi from "joi";

export const addJobVariationItemSchema = Joi.object({
  variation_id: Joi.string().uuid().required().messages({
    "string.guid": "Variation ID must be a valid UUID",
    "any.required": "Variation ID is required",
  }),
  price_list_item_id: Joi.string().uuid().required().messages({
    "string.guid": "Price List Item ID must be a valid UUID",
    "any.required": "Price List Item ID is required",
  }),
  quantity: Joi.number().min(0.01).optional().messages({
    "number.base": "Quantity must be a number",
    "number.min": "Quantity must be greater than 0",
  }),
  note: Joi.string().max(500).optional().allow(null, "").messages({
    "string.max": "Note must not exceed 500 characters",
  }),
});

export const addExtraJobVariationItemSchema = Joi.object({
  extra_type: Joi.string().valid("additional", "complimentary", "discount", "notes").required().messages({
    "any.required": "extra_type is required",
    "any.only": "extra_type must be one of: additional, complimentary, discount, notes",
  }),
  price_list_id: Joi.string().uuid().optional().allow(null).messages({
    "string.guid": "Price List ID must be a valid UUID",
  }),
  price_list_item_id: Joi.string().uuid().optional().allow(null).messages({
    "string.guid": "Price List Item ID must be a valid UUID",
  }),
  price_list_item_range_id: Joi.array().items(Joi.string().uuid()).unique().optional().messages({
    "array.base": "Range IDs must be an array",
    "string.guid": "Range ID must be a valid UUID",
  }),
  price_list_item_dwelling_type_id: Joi.array().items(Joi.string().uuid()).unique().optional().messages({
    "array.base": "Dwelling Type IDs must be an array",
    "string.guid": "Dwelling Type ID must be a valid UUID",
  }),
  additional: Joi.string().required().messages({
    "any.required": "Additional description is required",
  }),
  site_cost: Joi.string().allow(null, "").optional(),
  cost: Joi.string().allow(null, "").optional(),
  drawing_changes: Joi.boolean().optional().default(false),
  uom: Joi.string().allow(null, "").optional(),
  price: Joi.number().precision(2).when("extra_type", {
    is: Joi.valid("additional", "discount"),
    then: Joi.required(),
    otherwise: Joi.optional().allow(null, 0),
  }),
  quantity: Joi.number().min(0.01).when("extra_type", {
    is: Joi.valid("additional", "complimentary"),
    then: Joi.required(),
    otherwise: Joi.optional().allow(null, 1),
  }),
  note: Joi.string().max(500).optional().allow(null, ""),
  description: Joi.string().allow(null, "").optional(),
});

export const updateJobVariationItemSchema = Joi.object({
  quantity: Joi.number().min(0.01).optional().messages({
    "number.base": "Quantity must be a number",
    "number.min": "Quantity must be greater than 0",
  }),
  additional: Joi.string().optional().allow(null, "").messages({
    "string.base": "Additional item description must be a string",
  }),
  note: Joi.string().max(500).optional().allow(null, "").messages({
    "string.max": "Note must not exceed 500 characters",
  }),
});

export const updateExtraJobVariationItemSchema = Joi.object({
  additional: Joi.string().optional(),
  site_cost: Joi.string().allow(null, "").optional(),
  cost: Joi.string().allow(null, "").optional(),
  drawing_changes: Joi.boolean().optional(),
  uom: Joi.string().allow(null, "").optional(),
  price: Joi.number().precision(2).optional(),
  quantity: Joi.number().min(0.01).optional(),
  note: Joi.string().max(500).optional().allow(null, ""),
  description: Joi.string().allow(null, "").optional(),
  price_list_item_range_id: Joi.array().items(Joi.string().uuid()).unique().optional(),
  price_list_item_dwelling_type_id: Joi.array().items(Joi.string().uuid()).unique().optional(),
}).min(1);

export const getItemsByVariationParamsSchema = Joi.object({
  variation_id: Joi.string().uuid().required().messages({
    "string.guid": "Variation ID must be a valid UUID",
    "any.required": "Variation ID is required",
  }),
});

export const idParamsSchema = Joi.object({
  id: Joi.string().uuid().required().messages({
    "string.guid": "ID must be a valid UUID",
    "any.required": "ID is required",
  }),
});

export default {
  addJobVariationItemSchema,
  addExtraJobVariationItemSchema,
  updateExtraJobVariationItemSchema,
  updateJobVariationItemSchema,
  getItemsByVariationParamsSchema,
  idParamsSchema,
};
