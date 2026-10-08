import Joi from "joi";

export const createColorGroupItemMapSchema = Joi.object({
  color_group_id: Joi.string().uuid().required().messages({
    "any.required": "Color group ID is required",
    "string.uuid": "Color group ID must be a valid UUID",
    "string.guid": "Color group ID must be a valid UUID",
  }),
  color_item_id: Joi.string().uuid().required().messages({
    "any.required": "Color item ID is required",
    "string.uuid": "Color item ID must be a valid UUID",
    "string.guid": "Color item ID must be a valid UUID",
  }),
});

export const getAllColorGroupItemMapsSchema = Joi.object({
  color_group_id: Joi.string().uuid().optional().messages({
    "string.uuid": "Color group ID must be a valid UUID",
    "string.guid": "Color group ID must be a valid UUID",
  }),
  color_item_id: Joi.string().uuid().optional().messages({
    "string.uuid": "Color item ID must be a valid UUID",
    "string.guid": "Color item ID must be a valid UUID",
  }),
  page: Joi.number().integer().min(1).default(1).messages({
    "number.base": "Page must be a number",
    "number.integer": "Page must be an integer",
    "number.min": "Page must be at least 1",
  }),
  limit: Joi.number().integer().min(1).max(100).default(25).messages({
    "number.base": "Limit must be a number",
    "number.integer": "Limit must be an integer",
    "number.min": "Limit must be at least 1",
    "number.max": "Limit cannot exceed 100",
  }),
});

export const deleteColorGroupItemMapSchema = Joi.object({
  id: Joi.string().uuid().required().messages({
    "any.required": "Mapping ID is required",
    "string.uuid": "Mapping ID must be a valid UUID",
    "string.guid": "Mapping ID must be a valid UUID",
  }),
});

export default {
  createColorGroupItemMapSchema,
  getAllColorGroupItemMapsSchema,
  deleteColorGroupItemMapSchema,
};
