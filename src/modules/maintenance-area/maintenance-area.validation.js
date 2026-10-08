import Joi from "joi";
import { NAME_PATTERN, NAME_PATTERN_MESSAGE } from "../../utils/validationPatterns.js";

export const createMaintenanceAreaSchem = Joi.object({
  name: Joi.string()
    .trim()
    .min(2)
    .max(150)
    .pattern(NAME_PATTERN)
    .required(),
});

export const getAllMaintenanceAreaSchema = Joi.object({
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

export const deleteMaintenanceAreaSchema = Joi.object({
  maintenance_area_id: Joi.string().uuid().required().messages({
    "string.guid": "Maintenance area ID must be a valid UUID",
    "any.required": "Maintenance area ID  is required",
  }),
});

export const updateMaintenanceAreaParamsSchema = Joi.object({
  maintenance_area_id: Joi.string().uuid().required().messages({
    "string.guid": "Maintenance area ID must be a valid UUID",
    "any.required": "Maintenance area ID  is required",
  }),
});

export const updateMaintenanceAreaSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(2)
    .max(150)
    .pattern(NAME_PATTERN)
    .optional(),
});

export default {
  createMaintenanceAreaSchem,
  getAllMaintenanceAreaSchema,
  deleteMaintenanceAreaSchema,
  updateMaintenanceAreaParamsSchema,
  updateMaintenanceAreaSchema,
};
