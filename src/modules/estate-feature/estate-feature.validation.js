import Joi from "joi";
import { NAME_PATTERN, NAME_PATTERN_MESSAGE } from "../../utils/validationPatterns.js";

export const createEstateFeatureSchema = Joi.object({
  estate_id: Joi.string().uuid().required().messages({
    "string.guid": "estate ID must be a valid UUID.",
  }),
  feature_name: Joi.string()
    .trim()
    .min(2)
    .max(255)
    .pattern(NAME_PATTERN)
    .required(),
});

export const getAllEstateFeatureSchema = Joi.object({
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

export const getEstateFeatureByEstateIdSchema = Joi.object({
  estate_id: Joi.string().uuid().required().messages({
    "string.guid": "estate ID must be a valid UUID.",
  }),
});

export const deleteEstateFeatureSchema = Joi.object({
  estate_feature_id: Joi.string().uuid().required().messages({
    "string.guid": "estate feature ID must be a valid UUID",
    "any.required": "estate feature ID is required",
  }),
});

export const updateEstateFeatureSchema = Joi.object({
  feature_name: Joi.string()
    .trim()
    .min(2)
    .max(255)
    .pattern(NAME_PATTERN)
    .required()
    .messages({
      "string.empty": "Feature name cannot be empty",
      "string.min": "Feature name must be at least 2 characters",
      "string.max": "Feature name must not exceed 255 characters",
      "any.required": "Feature name is required",
    }),
});

export const updateEstateFeatureParamsSchema = Joi.object({
  estate_feature_id: Joi.string().uuid().required().messages({
    "string.guid": "estate feature ID must be a valid UUID",
    "any.required": "estate feature ID is required",
  }),
});

export default {
  createEstateFeatureSchema,
  getAllEstateFeatureSchema,
  getEstateFeatureByEstateIdSchema,
  deleteEstateFeatureSchema,
  updateEstateFeatureSchema,
  updateEstateFeatureParamsSchema,
};
