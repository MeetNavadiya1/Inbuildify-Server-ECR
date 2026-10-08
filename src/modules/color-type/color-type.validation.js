import Joi from "joi";
import { NAME_PATTERN, NAME_PATTERN_MESSAGE } from "../../utils/validationPatterns.js";

export const createColorTypeSchema = Joi.object({
  color_type_name: Joi.string()
    .trim()
    .min(2)
    .max(255)
    .required()
    .pattern(NAME_PATTERN)
    .messages({
      "any.required": "Color type name is required",
      "string.empty": "Color type name cannot be empty",
      "string.min": "Color type name must be at least 2 characters long",
      "string.max": "Color type name must not exceed 255 characters",
      "string.pattern.base":
        NAME_PATTERN_MESSAGE,
    }),
});

export const updateColorTypeSchema = Joi.object({
  color_type_name: Joi.string()
    .trim()
    .min(2)
    .max(255)
    .optional()
    .pattern(NAME_PATTERN)
    .messages({
      "string.empty": "Color type name cannot be empty",
      "string.min": "Color type name must be at least 2 characters long",
      "string.max": "Color type name must not exceed 255 characters",
      "string.pattern.base":
        NAME_PATTERN_MESSAGE,
    }),
})
  .min(1)
  .message({
    "object.min": "At least one field must be provided for update",
  });

export const paramsIdSchema = Joi.object({
  id: Joi.string().uuid().required().messages({
    "string.guid": "ID must be a valid UUID",
    "any.required": "ID is required",
  }),
});

export default {
  createColorTypeSchema,
  updateColorTypeSchema,
  paramsIdSchema,
};
