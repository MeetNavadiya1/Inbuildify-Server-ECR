import Joi from "joi";
import { NAME_PATTERN, NAME_PATTERN_MESSAGE } from "../../utils/validationPatterns.js";

export const createDwellingTypeSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(2)
    .max(150)
    .pattern(NAME_PATTERN)
    .required(),
  is_active: Joi.boolean().default(true),
});

export const updateDwellingTypeSchema = {
  params: Joi.object({
    dwelling_type_id: Joi.string().uuid().required().messages({
      "string.guid": "Dwelling type ID must be a valid UUID",
      "any.required": "Dwelling type ID is required",
    }),
  }),
  body: Joi.object({
    name: Joi.string()
      .trim()
      .min(2)
      .max(150)
      .pattern(NAME_PATTERN)
      .optional(),
  }),
};

export const deleteDwellingTypeSchema = {
  params: Joi.object({
    dwelling_type_id: Joi.string().uuid().required().messages({
      "string.guid": "Dwelling type ID must be a valid UUID",
      "any.required": "Dwelling type ID is required",
    }),
  }),
};

export const updateDwellingTypeParamsScehma = Joi.object({
  dwelling_type_id: Joi.string().uuid().required().messages({
    "string.guid": "Dwelling type ID must be a valid UUID",
    "any.required": "Dwelling type ID is required",
  }),
});

export const updateDwellingTypeActiveSchema = Joi.object({
  is_active: Joi.boolean().required(),
});

export default {
  createDwellingTypeSchema,
  updateDwellingTypeSchema,
  deleteDwellingTypeSchema,
  updateDwellingTypeParamsScehma,
  updateDwellingTypeActiveSchema,
};
