import Joi from "joi";
import { NAME_PATTERN, NAME_PATTERN_MESSAGE } from "../../utils/validationPatterns.js";

export const createColorItemCustomFieldSchema = Joi.object({
  color_item: Joi.string().uuid().required().messages({
    "string.guid": "Color Item ID must be a valid UUID",
    "any.required": "Color Item ID is required",
  }),
  field_type: Joi.string()
    .max(255)
    .valid("text", "checkbox", "dropdown_list", "radio_button")
    .required()
    .messages({
      "any.required": "Field type is required",
      "any.only":
        "Field type must be one of: text, checkbox, dropdown_list, radio_button",
    }),
  field_name: Joi.string()
    .trim()
    .min(2)
    .max(255)
    .pattern(NAME_PATTERN)
    .required()
    .messages({
      "any.required": "Field name is required",
      "string.max": "Field name must not exceed 255 characters",
    }),
  required_field: Joi.boolean().default(false).messages({
    "boolean.base": "Required field must be a boolean",
  }),
  sort_order: Joi.number().integer().default(1).messages({
    "number.base": "Sort order must be a number",
    "number.integer": "Sort order must be an integer",
  }),
});

export const updateColorItemCustomFieldSchema = Joi.object({
  color_item: Joi.string().uuid().optional().messages({
    "string.guid": "Color Item ID must be a valid UUID",
  }),
  field_type: Joi.string()
    .max(255)
    .valid("text", "checkbox", "dropdown_list", "radio_button")
    .optional()
    .messages({
      "any.only":
        "Field type must be one of: text, checkbox, dropdown_list, radio_button",
    }),
  field_name: Joi.string()
    .trim()
    .min(2)
    .max(255)
    .pattern(NAME_PATTERN)
    .optional()
    .messages({
      "string.max": "Field name must not exceed 255 characters",
    }),
  required_field: Joi.boolean().optional().messages({
    "boolean.base": "Required field must be a boolean",
  }),
  sort_order: Joi.number().integer().optional().messages({
    "number.base": "Sort order must be a number",
    "number.integer": "Sort order must be an integer",
  }),
})
  .min(1)
  .message({
    "object.min": "At least one field must be provided for update",
  });

export default {
  createColorItemCustomFieldSchema,
  updateColorItemCustomFieldSchema,
};
