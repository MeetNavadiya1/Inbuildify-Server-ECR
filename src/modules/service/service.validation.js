import Joi from "joi";
import { NAME_PATTERN, NAME_PATTERN_MESSAGE } from "../../utils/validationPatterns.js";

const serviceRule = Joi.string()
  .min(2)
  .max(100)
  .trim()
  .pattern(NAME_PATTERN)
  .messages({
    "string.base": "Service must be a string",
    "string.empty": "Service name is required",
    "string.min": "Service name must be at least 2 characters long",
    "string.max": "Service name must not exceed 100 characters",
    "string.pattern.base": NAME_PATTERN_MESSAGE,
    "any.required": "Service name is required",
  });

const serviceIdRule = Joi.string().uuid().messages({
  "string.base": "Service ID must be a string",
  "string.empty": "Service ID is required",
  "string.guid": "Service ID must be a valid UUID",
  "any.required": "Service ID is required",
});

export const createServiceSchema = Joi.object({
  service: serviceRule.required(),
});

export const getServiceByIdSchema = Joi.object({
  service_id: serviceIdRule.required(),
});

export const updateServiceSchema = Joi.object({
  service: serviceRule.required(),
});

export const updateServiceParamsSchema = Joi.object({
  service_id: serviceIdRule.required(),
});

export const deleteServiceSchema = Joi.object({
  service_id: serviceIdRule.required(),
});

export default {
  createServiceSchema,
  getServiceByIdSchema,
  updateServiceSchema,
  updateServiceParamsSchema,
  deleteServiceSchema,
};
