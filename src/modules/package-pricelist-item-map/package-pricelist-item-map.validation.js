import Joi from "joi";

export const createPriceListItemMapSchema = Joi.object({
  package_id: Joi.string().uuid().required().messages({
    "string.guid": "Package ID must be a valid UUID",
    "any.required": "Package ID is required",
  }),
  price_list_item_id: Joi.string().uuid().required().messages({
    "string.guid": "price list item ID must be a valid UUID",
    "any.required": "price list item ID is required",
  }),
});

export const getAllPackagePriceListItemMapSchema = Joi.object({
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

export const getPackagePricelistItemByPackageIdSchema = Joi.object({
  package_id: Joi.string().uuid().required().messages({
    "string.guid": "Package ID must be a valid UUID",
    "any.required": "Package ID is required",
  }),
});

export const deletePackagePricelistItemMapMapSchema = Joi.object({
  id: Joi.string().uuid().required().messages({
    "string.guid": "Package pricelist item ID must be a valid UUID",
    "any.required": "Package pricelist item ID is required",
  }),
});

export const updateackagePricelistItemMapParamsSchema = Joi.object({
  id: Joi.string().uuid().required().messages({
    "string.guid": "Package pricelist item ID must be a valid UUID",
    "any.required": "Package pricelist item ID is required",
  }),
});

export const updatePriceListItemMapSchema = Joi.object({
  package_id: Joi.string().uuid().optional().messages({
    "string.guid": "Package ID must be a valid UUID",
  }),
  price_list_item_id: Joi.string().uuid().optional().messages({
    "string.guid": "price list item ID must be a valid UUID",
  }),
});

export default {
  createPriceListItemMapSchema,
  getAllPackagePriceListItemMapSchema,
  getPackagePricelistItemByPackageIdSchema,
  deletePackagePricelistItemMapMapSchema,
  updateackagePricelistItemMapParamsSchema,
  updatePriceListItemMapSchema,
};
