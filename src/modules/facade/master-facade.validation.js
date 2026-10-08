import Joi from "joi";
import { NAME_PATTERN, NAME_PATTERN_MESSAGE } from "../../utils/validationPatterns.js";

const nameRule = Joi.string()
  .min(2)
  .max(100)
  .trim()
  .pattern(NAME_PATTERN)
  .messages({
    "string.base": "Name must be a string",
    "string.empty": "Name is required",
    "string.min": "Name must be at least 2 characters long",
    "string.max": "Name must not exceed 100 characters",
    "any.required": "Name is required",
  });

const imageRule = Joi.string().max(500).trim().allow("", null).messages({
  "string.base": "Image must be a string",
  "string.uri": "Image must be a valid URL",
  "string.max": "Image URL must not exceed 500 characters",
});

const rangeTypeRule = Joi.string().uuid().messages({
  "string.guid": "Surveyor ID must be a valid UUID",
});

const dwellingTypeRule = Joi.string().uuid().messages({
  "string.guid": "Dwelling type must be a UUID",
});

const booleanRule = (fieldName) =>
  Joi.boolean().messages({
    "boolean.base": `${fieldName} must be a boolean value`,
  });

const facadeIdRule = Joi.string().uuid().messages({
  "string.base": "Master Facade ID must be a string",
  "string.empty": "Master Facade ID is required",
  "string.guid": "Master Facade ID must be a valid UUID",
  "any.required": "Master Facade ID is required",
});

const pageRule = Joi.number().integer().min(1).default(1).messages({
  "number.base": "Page must be a number",
  "number.integer": "Page must be an integer",
  "number.min": "Page must be greater than 0",
});

const limitRule = Joi.number().integer().min(1).max(100).default(10).messages({
  "number.base": "Limit must be a number",
  "number.integer": "Limit must be an integer",
  "number.min": "Limit must be at least 1",
  "number.max": "Limit must not exceed 100",
});

const booleanFilterRule = Joi.string().valid("true", "false").messages({
  "any.only": "Boolean filter must be one of: true, false",
});

export const createMasterFacadeSchema = Joi.object({
  name: nameRule.required(),
  location_id: Joi.string().uuid().optional().allow(null),
  image: imageRule.optional(),
  range_id: rangeTypeRule.optional(),
  dwelling_type_id: dwellingTypeRule.optional(),
  cost_type: Joi.string()
    .max(20)
    .valid("standard", "upgrade")
    .default("standard")
    .messages({
      "any.only": "cost_type must be either 'standard' or 'upgrade'.",
    }),
  cost: Joi.string()
    .optional()
    .pattern(/^\d+$/)
    .custom((value, helpers) => {
      try {
        const num = BigInt(value);
        if (num <= 0n) {
          return helpers.error("number.min");
        }
        if (num > 1000000n) {
          return helpers.error("number.max");
        }
        return Number(num); // or keep as string if safer
      } catch {
        return helpers.error("number.base");
      }
    })
    .messages({
      "string.pattern.base": "Cost must be a valid number",
      "number.min": "Cost must not be less than 0",
      "number.max": "Cost must not exceed 1000000",
    }),

  builder_cost: Joi.number()
    .precision(2)
    .positive()
    .max(9999999999.99)
    .optional()
    .allow(null)
    .messages({
      "number.base": "Builder cost must be a number.",
      "number.positive": "Builder cost must be greater than 0.",
    }),

  status: Joi.boolean().default(true).messages({
    "boolean.base": "Status must be true or false.",
  }),
});

export const getMasterFacadeByIdSchema = Joi.object({
  id: facadeIdRule.required(),
});

export const getMasterFacadesSchema = Joi.object({
  name: Joi.string().max(100).optional(),
  search: Joi.string().allow("", null).max(150).optional(),
  range_id: Joi.string().uuid().optional(),
  floor_plan_id: Joi.string().uuid().optional(),
  dwelling_type_id: Joi.string().uuid().optional(),
  location_id: Joi.string().uuid().optional(),
  cost_type: Joi.string()
    .max(20)
    .valid("standard", "upgrade")
    .optional()
    .messages({
      "any.only": "cost_type must be either 'standard' or 'upgrade'.",
    }),
  status: Joi.boolean().optional(),
  page: pageRule,
  limit: limitRule,
});

export const updateMasterFacadeSchema = Joi.object({
  location_id: Joi.string().uuid().optional().messages({
    "string.guid": "Invalid location_id.",
  }),
  name: nameRule.optional(),
  image: imageRule.optional(),
  range_id: rangeTypeRule.optional(),
  dwelling_type_id: dwellingTypeRule.optional(),
  cost_type: Joi.string()
    .max(20)
    .valid("standard", "upgrade")
    .optional()
    .messages({
      "any.only": "cost_type must be either 'standard' or 'upgrade'.",
    }),
  cost: Joi.string()
    .optional()
    .pattern(/^\d+$/)
    .custom((value, helpers) => {
      try {
        const num = BigInt(value);
        if (num <= 0n) {
          return helpers.error("number.min");
        }
        if (num > 1000000n) {
          return helpers.error("number.max");
        }
        return Number(num); // or keep as string if safer
      } catch {
        return helpers.error("number.base");
      }
    })
    .messages({
      "string.pattern.base": "Cost must be a valid number",
      "number.min": "Cost must not be less than 0",
      "number.max": "Cost must not exceed 1000000",
    }),

  builder_cost: Joi.number()
    .precision(2)
    .positive()
    .max(9999999999.99)
    .optional()
    .allow(null)
    .messages({
      "number.base": "Builder cost must be a number.",
      "number.positive": "Builder cost must be greater than 0.",
    }),
  status: Joi.boolean().optional().messages({
    "boolean.base": "Status must be true or false.",
  }),
})
  .min(1)
  .messages({
    "object.min": "At least one field is required to update",
  });

export const updateMasterFacadeParamsSchema = Joi.object({
  facade_id: facadeIdRule.required(),
});

export const deleteMasterFacadeSchema = Joi.object({
  facade_id: facadeIdRule.required(),
});

export default {
  createMasterFacadeSchema,
  getMasterFacadeByIdSchema,
  getMasterFacadesSchema,
  updateMasterFacadeSchema,
  updateMasterFacadeParamsSchema,
  deleteMasterFacadeSchema,
};
