import Joi from "joi";

const uuidRule = Joi.string().uuid().required().messages({
  "string.guid": "ID must be a valid UUID",
  "any.required": "ID is required",
});

const optionalUuidRule = Joi.string().uuid().optional().allow(null).messages({
  "string.guid": "ID must be a valid UUID",
});

const stringRule = Joi.string().trim().messages({
  "string.base": "Must be a string",
  "string.empty": "Field cannot be empty",
});

export const createHouseFeatureSchema = Joi.object({
  name: stringRule.max(255).required().messages({
    "any.required": "Name is required",
    "string.max": "Name must not exceed 255 characters",
  }),
  description: stringRule.max(3000).optional().allow("").messages({
    "string.max": "Description must not exceed 3000 characters",
  }),
  company_id: optionalUuidRule,
  builder_id: optionalUuidRule,
});

export const updateHouseFeatureSchema = Joi.object({
  name: stringRule.max(255).optional().messages({
    "string.max": "Name must not exceed 255 characters",
  }),
  description: stringRule.max(3000).optional().allow("").messages({
    "string.max": "Description must not exceed 3000 characters",
  }),
  company_id: optionalUuidRule,
  builder_id: optionalUuidRule,
});

export const getHouseFeatureByIdSchema = Joi.object({
  house_feature_id: uuidRule,
});

export const deleteHouseFeatureSchema = Joi.object({
  house_feature_id: uuidRule,
});

export const getAllHouseFeaturesSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1).messages({
    "number.base": "Page must be a number",
    "number.integer": "Page must be an integer",
    "number.min": "Page must be greater than 0",
  }),
  limit: Joi.number().integer().min(1).max(100).default(25).messages({
    "number.base": "Limit must be a number",
    "number.integer": "Limit must be an integer",
    "number.min": "Limit must be at least 1",
    "number.max": "Limit must not exceed 100",
  }),
  company_id: optionalUuidRule,
  builder_id: optionalUuidRule,
  search: stringRule.max(255).optional().allow(""),
});

export default {
  createHouseFeatureSchema,
  updateHouseFeatureSchema,
  getHouseFeatureByIdSchema,
  deleteHouseFeatureSchema,
  getAllHouseFeaturesSchema,
};
