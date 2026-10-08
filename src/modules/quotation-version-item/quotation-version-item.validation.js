import Joi from "joi";

export const addQuotationItemSchema = Joi.object({
  quotation_version_id: Joi.string().uuid().required().messages({
    "string.guid": "Quotation Version ID must be a valid UUID",
    "any.required": "Quotation Version ID is required",
  }),
  price_list_item_id: Joi.string().uuid().required().messages({
    "string.guid": "Price List Item ID must be a valid UUID",
    "any.required": "Price List Item ID is required",
  }),
  quantity: Joi.number().min(0.01).max(999).optional().messages({
    "number.base": "Quantity must be a number",
    "number.min": "Quantity must be greater than 0",
    "number.max": "Quantity must not exceed 999",
  }),
  note: Joi.string().max(500).optional().allow(null, "").messages({
    "string.max": "Note must not exceed 500 characters",
  }),
});

export const addQuotationPackageSchema = Joi.object({
  quotation_version_id: Joi.string().uuid().required().messages({
    "string.guid": "Quotation Version ID must be a valid UUID",
    "any.required": "Quotation Version ID is required",
  }),
  package_id: Joi.string().uuid().required().messages({
    "string.guid": "Package ID must be a valid UUID",
    "any.required": "Package ID is required",
  }),
});

export const updateQuotationPackageSchema = Joi.object({
  quotation_version_id: Joi.string().uuid().required().messages({
    "string.guid": "Quotation Version ID must be a valid UUID",
    "any.required": "Quotation Version ID is required",
  }),
  package_id: Joi.string().uuid().required().messages({
    "string.guid": "Package ID must be a valid UUID",
    "any.required": "Package ID is required",
  }),
});

export const updateQuotationItemSchema = Joi.object({
  quantity: Joi.number().min(0.01).max(999).optional().messages({
    "number.base": "Quantity must be a number",
    "number.min": "Quantity must be greater than 0",
    "number.max": "Quantity must not exceed 999",
  }),
  price_list_item_description: Joi.string().optional().allow(null, "").messages({
    "string.base": "Price List Item Description must be a string",
  }),
  note: Joi.string().max(500).optional().allow(null, "").messages({
    "string.max": "Note must not exceed 500 characters",
  }),
});

export const getItemsByVersionParamsSchema = Joi.object({
  quotation_version_id: Joi.string().uuid().required().messages({
    "string.guid": "Quotation Version ID must be a valid UUID",
    "any.required": "Quotation Version ID is required",
  }),
});

export const getItemsByVersionQuerySchema = Joi.object({
  package_id: Joi.string().uuid().optional().messages({
    "string.guid": "Package ID must be a valid UUID",
  }),
  range_id: Joi.string().uuid().optional().messages({
    "string.guid": "Range ID must be a valid UUID",
  }),
  dwelling_type_id: Joi.string().uuid().optional().messages({
    "string.guid": "Dwelling Type ID must be a valid UUID",
  }),
});

export const idParamsSchema = Joi.object({
  id: Joi.string().uuid().required().messages({
    "string.guid": "ID must be a valid UUID",
    "any.required": "ID is required",
  }),
});

export const deletePackageParamsSchema = Joi.object({
  quotation_version_id: Joi.string().uuid().required(),
  package_id: Joi.string().uuid().required(),
});

export const addExtraQuotationItemSchema = Joi.object({
  extra_type: Joi.string().valid("item", "complimentry", "discount").required().messages({
    "any.required": "extra_type is required",
    "any.only": "extra_type must be one of: item, complimentry, discount",
  }),
  price_list_id: Joi.string().uuid().required().messages({
    "string.guid": "Price List ID must be a valid UUID",
    "any.required": "Price List ID is required",
  }),
  // The master price-list item this extra item is based on. Saved so the
  // price-list-item listing can hide items already used as extra items.
  // Optional/nullable — discount & complimentry rows may not map to a master item.
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
  price_list_item_description: Joi.string().required().messages({
    "any.required": "Item Description is required",
  }),
  price_list_item_cost_type: Joi.string().valid("Included", "Fixed", "Variable").when("extra_type", {
    is: "item",
    then: Joi.required(),
    otherwise: Joi.when("extra_type", {
      is: "complimentry",
      then: Joi.optional(),
      otherwise: Joi.forbidden(),
    }),
  }),
  price_list_item_cost_type_text: Joi.string().when("price_list_item_cost_type", {
    is: "Included",
    then: Joi.required(),
    otherwise: Joi.optional().allow(null, ""),
  }),
  price_list_item_builder_cost: Joi.number().precision(2).when("price_list_item_cost_type", {
    is: "Included",
    then: Joi.forbidden(),
    otherwise: Joi.when("extra_type", {
      is: "item",
      then: Joi.required(),
      otherwise: Joi.forbidden(),
    }),
  }),
  price_list_item_uom: Joi.string().valid(
    "SQ_FT",
    "SQ_M",
    "SQ_YD",
    "ACRE",
    "HECTARE",
    "CUBIC_METER",
    "CUBIC_FEET",
    "KG",
    "TON",
    "METER",
    "FEET",
    "NOS",
    "UNITS",
    "LITER",
  ).when("extra_type", {
    is: "item",
    then: Joi.required(),
    otherwise: Joi.when("extra_type", {
      is: "complimentry",
      then: Joi.required(),
      otherwise: Joi.forbidden(),
    }),
  }).messages({
    "any.required": "price_list_item_uom is required",
  }),
  price_list_item_cost: Joi.number().precision(2).when("price_list_item_cost_type", {
    is: "Included",
    then: Joi.forbidden(),
    otherwise: Joi.when("extra_type", {
      is: Joi.valid("item", "discount"),
      then: Joi.required(),
      otherwise: Joi.when("extra_type", {
        is: "complimentry",
        then: Joi.optional(),
        otherwise: Joi.forbidden(),
      }),
    }),
  }),
  quantity: Joi.number().min(0.01).max(999).when("price_list_item_cost_type", {
    is: "Included",
    then: Joi.forbidden(),
    otherwise: Joi.when("extra_type", {
      is: "item",
      then: Joi.required(),
      otherwise: Joi.when("extra_type", {
        is: "complimentry",
        then: Joi.optional(),
        otherwise: Joi.forbidden(),
      }),
    }),
  }).messages({
    "number.base": "Quantity must be a number",
    "number.min": "Quantity must be greater than 0",
    "number.max": "Quantity must not exceed 999",
  }),
  note: Joi.string().max(500).optional().allow(null, ""),
});

export const updateExtraQuotationItemSchema = Joi.object({
  price_list_item_description: Joi.string().optional(),
  price_list_item_cost_type: Joi.string().valid("Included", "Fixed", "Variable").optional(),
  price_list_item_cost_type_text: Joi.string().when("price_list_item_cost_type", {
    is: "Included",
    then: Joi.required(),
    otherwise: Joi.optional().allow(null, ""),
  }),
  price_list_item_builder_cost: Joi.number().precision(2).when("price_list_item_cost_type", {
    is: "Included",
    then: Joi.forbidden(),
    otherwise: Joi.optional(),
  }),
  price_list_item_uom: Joi.string().valid(
    "SQ_FT",
    "SQ_M",
    "SQ_YD",
    "ACRE",
    "HECTARE",
    "CUBIC_METER",
    "CUBIC_FEET",
    "KG",
    "TON",
    "METER",
    "FEET",
    "NOS",
    "UNITS",
    "LITER",
  ).optional(),
  price_list_item_cost: Joi.number().precision(2).when("price_list_item_cost_type", {
    is: "Included",
    then: Joi.forbidden(),
    otherwise: Joi.optional(),
  }),
  quantity: Joi.number().min(0.01).max(999).when("price_list_item_cost_type", {
    is: "Included",
    then: Joi.forbidden(),
    otherwise: Joi.optional(),
  }).messages({
    "number.base": "Quantity must be a number",
    "number.min": "Quantity must be greater than 0",
    "number.max": "Quantity must not exceed 999",
  }),
  price_list_item_range_id: Joi.array().items(Joi.string().uuid()).unique().optional(),
  price_list_item_dwelling_type_id: Joi.array().items(Joi.string().uuid()).unique().optional(),
  note: Joi.string().max(500).optional().allow(null, ""),
}).min(1);

export default {
  addQuotationItemSchema,
  addQuotationPackageSchema,
  updateQuotationPackageSchema,
  updateQuotationItemSchema,
  getItemsByVersionParamsSchema,
  idParamsSchema,
  deletePackageParamsSchema,
  addExtraQuotationItemSchema,
  updateExtraQuotationItemSchema,
};
