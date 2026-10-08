import Joi from "joi";
import { NAME_PATTERN, NAME_PATTERN_MESSAGE } from "../../utils/validationPatterns.js";

export const createSalesProccessSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(2)
    .max(150)
    .pattern(NAME_PATTERN)
    .required(),
  is_default: Joi.boolean().default(false),
});

export const deleteSalesProcessSchema = Joi.object({
  id: Joi.string().uuid().required().messages({
    "string.guid": "Sales process ID must be a valid UUID",
    "any.required": "Sales process ID is required",
  }),
});

export const updateSalesProcessIdParamsSchema = Joi.object({
  id: Joi.string().uuid().required().messages({
    "string.guid": "Sales process ID must be a valid UUID",
    "any.required": "Sales process ID is required",
  }),
});

export const updateSalesProcessSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(2)
    .max(150)
    .pattern(NAME_PATTERN)
    .optional(),
  is_default: Joi.boolean().default(false),
});

export default {
  createSalesProccessSchema,
  deleteSalesProcessSchema,
  updateSalesProcessIdParamsSchema,
  updateSalesProcessSchema,
};
