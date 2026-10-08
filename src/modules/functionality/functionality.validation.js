import Joi from "joi";

export const createFunctionalitySchema = Joi.object({
  screen_id: Joi.string().uuid().required().messages({
    "string.guid": "Screen ID must be a valid UUID",
    "any.required": "Screen ID is required",
  }),
  name: Joi.string().max(150).required().messages({
    "any.required": "Functionality name is required.",
  }),
});

export const getFunctionalitiesSchema = Joi.object({
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

export const deleteFunctionalitySchema = Joi.object({
  functionality_id: Joi.string().uuid().required().messages({
    "string.guid": "functionality ID must be a valid UUID",
    "any.required": "functionality ID is required",
  }),
});

export const updateFunctionalityParamsSchema = Joi.object({
  functionality_id: Joi.string().uuid().required().messages({
    "string.guid": "functionality ID must be a valid UUID",
    "any.required": "functionality ID is required",
  }),
});

export const updateFunctionalitySchema = Joi.object({
  screen_id: Joi.string().uuid().optional().messages({
    "string.guid": "Screen ID must be a valid UUID",
  }),
  name: Joi.string().max(150).optional(),
});

export const getFunctionalitiesByScreenSchema = Joi.object({
  screenId: Joi.string().uuid().required().messages({
    "string.guid": "screen ID must be a valid UUID",
    "any.required": "screen ID is required",
  }),
});

export default {
  createFunctionalitySchema,
  getFunctionalitiesSchema,
  deleteFunctionalitySchema,
  updateFunctionalityParamsSchema,
  updateFunctionalitySchema,
  getFunctionalitiesByScreenSchema,
};
