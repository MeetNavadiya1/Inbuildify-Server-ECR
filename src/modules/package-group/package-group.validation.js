import Joi from "joi";
import { NAME_PATTERN, NAME_PATTERN_MESSAGE } from "../../utils/validationPatterns.js";

export const createPackageGroupSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(2)
    .max(150)
    .pattern(NAME_PATTERN)
    .required(),
  no_of_packages: Joi.number().integer().min(0).default(0),
});

export const getAllPackageGroupSchema = Joi.object({
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

export const deletePackageGroupSchema = Joi.object({
  package_group_id: Joi.string().uuid().required().messages({
    "string.guid": "Package ID must be a valid UUID",
    "any.required": "Package ID is required",
  }),
});

export const updatePackageGroupParamsSchema = Joi.object({
  package_group_id: Joi.string().uuid().required().messages({
    "string.guid": "Package ID must be a valid UUID",
    "any.required": "Package ID is required",
  }),
});

export const updatePackageGroupSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(2)
    .max(150)
    .pattern(NAME_PATTERN)
    .optional(),
  no_of_packages: Joi.number().integer().min(0).optional(),
});

export default {
  createPackageGroupSchema,
  getAllPackageGroupSchema,
  deletePackageGroupSchema,
  updatePackageGroupParamsSchema,
  updatePackageGroupSchema,
};
