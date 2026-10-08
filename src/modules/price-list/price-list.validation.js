import Joi from "joi";
import { NAME_PATTERN, NAME_PATTERN_MESSAGE } from "../../utils/validationPatterns.js";

export const createPriceListSchema = Joi.object({
  name: Joi.string()
    .min(2)
    .max(200)
    .pattern(NAME_PATTERN)
    .required(),
  // sort_order: Joi.number().integer().min(0).default(0).optional(),
  show_in_view_list: Joi.boolean().default(true),
  location: Joi.string().uuid().optional().messages({
    "string.uuid": "Location ID must be a valid UUID",
  }),
});

export const getAllPriceListSchema = Joi.object({
  is_active: Joi.boolean().optional(),
  is_suggested: Joi.boolean().optional(),
  search: Joi.string().allow("", null).max(200).optional(),
  location_id: Joi.string().uuid().optional().messages({
    "string.uuid": "Location ID must be a valid UUID",
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

export const deletePriceListSchema = Joi.object({
  priceListId: Joi.string().uuid().required().messages({
    "string.guid": "price list ID must be a valid UUID",
    "any.required": "price list ID is required",
  }),
});

export const updatePriceListParamsSchema = Joi.object({
  priceListId: Joi.string().uuid().required().messages({
    "string.guid": "price list ID must be a valid UUID",
    "any.required": "price list ID is required",
  }),
});

export const updatePriceListSchema = Joi.object({
  name: Joi.string()
    .min(2)
    .max(200)
    .pattern(NAME_PATTERN)
    .optional(),
  sort_order: Joi.number().integer().min(0).default(0).optional(),
  show_in_view_list: Joi.boolean(),
  is_active: Joi.boolean(),
  location: Joi.string().uuid().optional().messages({
    "string.uuid": "Location ID must be a valid UUID",
  }),
});

export default {
  createPriceListSchema,
  getAllPriceListSchema,
  deletePriceListSchema,
  updatePriceListParamsSchema,
  updatePriceListSchema,
};
