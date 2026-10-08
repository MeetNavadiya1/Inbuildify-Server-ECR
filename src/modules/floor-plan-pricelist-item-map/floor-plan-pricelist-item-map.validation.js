import Joi from "joi";

export const createFloorPlanPricelistItemMapValidation = Joi.object({
  floor_plan_id: Joi.string().uuid().required().messages({
    "string.uuid": "Floor plan ID must be a valid UUID",
    "any.required": "Floor plan ID is required",
  }),
  price_list_item_id: Joi.string().uuid().required().messages({
    "string.uuid": "Price list item ID must be a valid UUID",
    "any.required": "Price list item ID is required",
  }),
  include_default: Joi.boolean().optional().messages({
    "boolean.base": "Include default must be a boolean",
  }),
  modify: Joi.boolean().optional().messages({
    "boolean.base": "Modify must be a boolean",
  }),
  quantity: Joi.number().integer().optional().allow(null).messages({
    "number.integer": "Quantity must be an integer",
  }),
});

export const updateFloorPlanPricelistItemMapValidation = Joi.object({
  include_default: Joi.boolean().optional().messages({
    "boolean.base": "Include default must be a boolean",
  }),
  modify: Joi.boolean().optional().messages({
    "boolean.base": "Modify must be a boolean",
  }),
}).min(1);

export const getFloorPlanPricelistItemMapByIdValidation = Joi.object({
  id: Joi.string().uuid().required().messages({
    "string.uuid": "ID must be a valid UUID",
    "any.required": "ID is required",
  }),
});

export const queryValidation = Joi.object({
  page: Joi.number().integer().min(1).optional().messages({
    "number.integer": "Page must be an integer",
    "number.min": "Page must be at least 1",
  }),
  limit: Joi.number().integer().min(1).max(100).optional().messages({
    "number.integer": "Limit must be an integer",
    "number.min": "Limit must be at least 1",
    "number.max": "Limit must be at most 100",
  }),
  floor_plan_id: Joi.string().uuid().optional().messages({
    "string.uuid": "Floor plan ID must be a valid UUID",
  }),
  price_list_item_id: Joi.string().uuid().optional().messages({
    "string.uuid": "Price list item ID must be a valid UUID",
  }),
  include_default: Joi.boolean().optional().messages({
    "boolean.base": "Include default must be a boolean",
  }),
  modify: Joi.boolean().optional().messages({
    "boolean.base": "Modify must be a boolean",
  }),
});

export default {
  createFloorPlanPricelistItemMapValidation,
  updateFloorPlanPricelistItemMapValidation,
  getFloorPlanPricelistItemMapByIdValidation,
  queryValidation,
};
