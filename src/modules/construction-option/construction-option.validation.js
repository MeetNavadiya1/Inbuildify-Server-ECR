import Joi from "joi";
import { NAME_PATTERN, NAME_PATTERN_MESSAGE } from "../../utils/validationPatterns.js";

export const createConstructionOptionSchema = Joi.object({
  option_name: Joi.string()
    .trim()
    .min(2)
    .max(255)
    .pattern(NAME_PATTERN)
    .required(),
});

export const deleteConstructionOptionSchema = Joi.object({
  id: Joi.string().uuid().required().messages({
    "string.guid": "construction option ID must be a valid UUID",
    "any.required": "construction option ID is required",
  }),
});

export const updateConstructionOptionParamsSchema = Joi.object({
  id: Joi.string().uuid().required().messages({
    "string.guid": "construction option ID must be a valid UUID",
    "any.required": "construction option ID is required",
  }),
});

export const updateConstructionOptionSchema = Joi.object({
  option_name: Joi.string()
    .min(2)
    .trim()
    .max(255)
    .pattern(NAME_PATTERN)
    .optional(),
});

export default {
  createConstructionOptionSchema,
  deleteConstructionOptionSchema,
  updateConstructionOptionParamsSchema,
  updateConstructionOptionSchema,
};
