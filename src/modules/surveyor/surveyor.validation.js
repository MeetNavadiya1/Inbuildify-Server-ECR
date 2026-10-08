import Joi from "joi";
import { SUPPORTED_POSTCODE_MESSAGE, SUPPORTED_POSTCODE_PATTERN } from "../city/city.data.js";
import { ADDRESS_PATTERN, ADDRESS_PATTERN_MESSAGE, NAME_PATTERN, NAME_PATTERN_MESSAGE } from "../../utils/validationPatterns.js";

export const createSurveyorSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(2)
    .max(150)
    .pattern(NAME_PATTERN)
    .required()
    .messages({
      "string.pattern.base": NAME_PATTERN_MESSAGE,
      "any.required": "Name is required.",
    }),

  email: Joi.string()
    .trim()
    .email()
    .max(250)
    .allow(null, "")
    .optional()
    .messages({
      "string.email": "Email must be a valid email address.",
      "string.max": "Email cannot exceed 250 characters.",
    }),
  phone: Joi.string()
    .trim()
    .min(10)
    .max(15)
    .allow(null, "")
    .optional()
    .messages({
      "string.max": "Phone cannot exceed 15 characters.",
    }),
  abn_number: Joi.string()
    .trim()
    .min(11)
    .max(11)
    .allow(null, "")
    .optional()
    .messages({
      "string.max": "ABN number cannot exceed 11 characters.",
    }),
  registration_number: Joi.string()
    .trim()
    .min(5)
    .max(100)
    .allow(null, "")
    .optional()
    .messages({
      "string.min": "Registration number must be at least 5 characters long",
      "string.max": "Registration number cannot exceed 100 characters.",
    }),
  address1: Joi.string()
    .trim()
    .min(10)
    .max(255)
    .pattern(ADDRESS_PATTERN)
    .required()
    .messages({
      "string.pattern.base": ADDRESS_PATTERN_MESSAGE,
      "any.required": "Address line 1 is required",
      "string.min": "Address line 1 must be at least 10 characters long",
      "string.max": "Address line 1 must not exceed 255 characters",
    }),
  address2: Joi.string()
    .trim()
    .min(2)
    .max(255)
    .pattern(ADDRESS_PATTERN)
    .optional()
    .messages({
      "string.pattern.base": ADDRESS_PATTERN_MESSAGE,
      "string.min": "Address line 2 must be at least 2 characters long",
      "string.max": "Address line 2 must not exceed 255 characters",
    }),
  city: Joi.string()
    .trim()
    .min(2)
    .max(150)
    .pattern(/^(?=.*[a-zA-Z])[a-zA-Z0-9\s,./#-]+$/)
    .required(),
  state_id: Joi.string().uuid().required().messages({
    "string.guid": "state ID must be a valid UUID",
    "any.required": "state ID is required",
  }),
  country_id: Joi.string().uuid().allow(null, "").optional().messages({
    "string.guid": "country ID must be a valid UUID",
  }),
  // Digits only here; the exact rule for the surveyor's country and state is checked on save (locationGuard).
  zip_postal_code: Joi.string()
    .trim()
    .pattern(SUPPORTED_POSTCODE_PATTERN)
    .required()
    .messages({ "string.pattern.base": SUPPORTED_POSTCODE_MESSAGE }),
});

export const getAllServeyorSchema = Joi.object({
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

export const deleteSurveyorSchema = Joi.object({
  surveyor_id: Joi.string().uuid().required().messages({
    "string.guid": "Surveyor ID must be a valid UUID",
    "any.required": "Surveyor ID is required",
  }),
});

export const updateSurveyorIdParamsSchema = Joi.object({
  surveyor_id: Joi.string().uuid().required().messages({
    "string.guid": "Surveyor ID must be a valid UUID",
    "any.required": "Surveyor ID is required",
  }),
});

export const updateSurveyorSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(2)
    .max(150)
    .pattern(NAME_PATTERN)
    .optional()
    .messages({
      "string.pattern.base": NAME_PATTERN_MESSAGE,
      "string.max": "Name cannot exceed 150 characters.",
    }),
  email: Joi.string()
    .trim()
    .email()
    .max(150)
    .allow(null, "")
    .optional()
    .messages({
      "string.email": "Email must be a valid email address.",
      "string.max": "Email cannot exceed 150 characters.",
    }),
  phone: Joi.string()
    .trim()
    .min(10)
    .max(15)
    .allow(null, "")
    .optional()
    .messages({
      "string.max": "Phone cannot exceed 15 characters.",
    }),
  abn_number: Joi.string()
    .trim()
    .min(11)
    .max(11)
    .allow(null, "")
    .optional()
    .messages({
      "string.max": "ABN number cannot exceed 11 characters.",
    }),
  registration_number: Joi.string()
    .trim()
    .min(5)
    .max(100)
    .allow(null, "")
    .optional()
    .messages({
      "string.min": "Registration number must be at least 5 characters long",
      "string.max": "Registration number cannot exceed 100 characters.",
    }),
  address1: Joi.string()
    .trim()
    .min(2)
    .max(255)
    .pattern(ADDRESS_PATTERN)
    .optional()
    .messages({
      "string.pattern.base": ADDRESS_PATTERN_MESSAGE,
      "string.min": "Address line 2 must be at least 2 characters long",
      "string.max": "Address line 2 must not exceed 255 characters",
    }),
  address2: Joi.string()
    .trim()
    .min(2)
    .max(255)
    .allow(null, "")
    .pattern(ADDRESS_PATTERN)
    .optional()
    .messages({
      "string.pattern.base": ADDRESS_PATTERN_MESSAGE,
      "string.min": "Address line 1 must be at least 2 characters long",
      "string.max": "Address line 1 must not exceed 255 characters",
    }),
  city: Joi.string()
    .trim()
    .min(2)
    .max(150)
    .pattern(/^(?=.*[a-zA-Z])[a-zA-Z0-9\s,./#-]+$/)
    .optional(),
  state_id: Joi.string().uuid().optional().messages({
    "string.guid": "state ID must be a valid UUID",
  }),
  country_id: Joi.string().uuid().allow(null, "").optional().messages({
    "string.guid": "country ID must be a valid UUID",
  }),
  // Digits only here; the exact rule for the surveyor's country and state is checked on save (locationGuard).
  zip_postal_code: Joi.string()
    .trim()
    .pattern(SUPPORTED_POSTCODE_PATTERN)
    .optional()
    .messages({ "string.pattern.base": SUPPORTED_POSTCODE_MESSAGE }),
});

export default {
  createSurveyorSchema,
  getAllServeyorSchema,
  deleteSurveyorSchema,
  updateSurveyorIdParamsSchema,
  updateSurveyorSchema,
};
