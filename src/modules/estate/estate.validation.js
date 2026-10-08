import Joi from "joi";
import { SUPPORTED_POSTCODE_MESSAGE, SUPPORTED_POSTCODE_PATTERN } from "../city/city.data.js";
import { ADDRESS_PATTERN, NAME_PATTERN } from "../../utils/validationPatterns.js";

// Cities regularly contain apostrophes ("O'Brien"), ampersands and parentheses — allow
// them while still requiring at least one letter. Estate and street names use the
// shared NAME_PATTERN / ADDRESS_PATTERN, which allow any character but < and >.
const CITY_PATTERN = /^(?=.*[a-zA-Z])[a-zA-Z0-9\s,.'&()/#-]+$/;
// Free-text: allow any character except angle brackets (prevents HTML injection).
const FREE_TEXT_PATTERN = /^[^<>]*$/;

export const createEstateSchema = Joi.object({
  name: Joi.string()
    .min(2)
    .max(150)
    .pattern(NAME_PATTERN)
    .required(),

  street_name: Joi.string()
    .min(2)
    .max(150)
    .pattern(ADDRESS_PATTERN)
    .optional(),

  city: Joi.string()
    .min(2)
    .max(100)
    .pattern(CITY_PATTERN)
    .allow(null, "")
    .optional(),

  state_id: Joi.string().uuid().allow(null, "").optional().messages({
    "string.guid": "state ID must be a valid UUID.",
  }),

  country_id: Joi.string().uuid().allow(null, "").optional().messages({
    "string.guid": "country ID must be a valid UUID.",
  }),

  // Digits only here; the exact rule for the estate's country and state is checked on save (locationGuard).
  zip: Joi.string()
    .pattern(SUPPORTED_POSTCODE_PATTERN)
    .allow(null, "")
    .optional()
    .messages({ "string.pattern.base": SUPPORTED_POSTCODE_MESSAGE }),

  estate_logo: Joi.string().max(500).allow(null, "").optional(),

  website: Joi.string().uri().max(255).allow(null, "").optional(),

  description: Joi.string()
    .max(4000)
    .pattern(FREE_TEXT_PATTERN)
    .allow(null, "")
    .optional(),

  status: Joi.boolean().default(true),

  featured: Joi.boolean().default(false),
});

export const getAllEstateSchema = Joi.object({
  name: Joi.string().max(150).optional(),
  status: Joi.boolean().optional(),
  location: Joi.string().max(150).optional().messages({
    "string.base": "Location must be a string",
    "string.max": "Location must not exceed 150 characters",
  }),
  zip_code: Joi.string().trim().max(4).optional().messages({
    "string.base": "Zip code must be a string",
    "string.length": "Zip code must not exceed 4 characters",
  }),

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

export const deleteEstateSchema = Joi.object({
  estate_id: Joi.string().uuid().required().messages({
    "string.guid": "estate ID must be a valid UUID",
    "any.required": "estate ID is required",
  }),
});

export const updateEstateParamsSchema = Joi.object({
  estate_id: Joi.string().uuid().optional().messages({
    "string.guid": "estate ID must be a valid UUID",
    "any.required": "estate ID is required",
  }),
});

export const updateEstateSchema = Joi.object({
  name: Joi.string()
    .min(2)
    .max(150)
    .pattern(NAME_PATTERN)
    .optional(),

  street_name: Joi.string()
    .max(150)
    .allow(null, "")
    .pattern(ADDRESS_PATTERN)
    .optional(),

  city: Joi.string()
    .max(100)
    .pattern(CITY_PATTERN)
    .allow(null, "")
    .optional(),

  state_id: Joi.string().uuid().allow(null, "").optional().messages({
    "string.guid": "state ID must be a valid UUID.",
  }),

  country_id: Joi.string().uuid().allow(null, "").optional().messages({
    "string.guid": "country ID must be a valid UUID.",
  }),

  // Digits only here; the exact rule for the estate's country and state is checked on save (locationGuard).
  zip: Joi.string()
    .pattern(SUPPORTED_POSTCODE_PATTERN)
    .allow(null, "")
    .optional()
    .messages({ "string.pattern.base": SUPPORTED_POSTCODE_MESSAGE }),

  estate_logo: Joi.string().max(500).allow(null, "").optional(),

  website: Joi.string().uri().max(255).allow(null, "").optional(),

  description: Joi.string()
    .max(4000)
    .pattern(FREE_TEXT_PATTERN)
    .allow(null, "")
    .optional(),

  status: Joi.boolean().optional(),

  featured: Joi.boolean().optional(),
});

export default {
  createEstateSchema,
  getAllEstateSchema,
  deleteEstateSchema,
  updateEstateParamsSchema,
  updateEstateSchema,
};
