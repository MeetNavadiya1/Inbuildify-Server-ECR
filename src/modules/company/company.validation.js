import Joi from "joi";
import { SUPPORTED_POSTCODE_MESSAGE, SUPPORTED_POSTCODE_PATTERN } from "../city/city.data.js";
import { ADDRESS_PATTERN, ADDRESS_PATTERN_MESSAGE, NAME_PATTERN, NAME_PATTERN_MESSAGE } from "../../utils/validationPatterns.js";

const addressSchema = Joi.object({
  address_line1: Joi.string()
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
  address_line2: Joi.string()
    .trim()
    .min(2)
    .max(255)
    .allow(null, "")
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
    .max(100)
    .pattern(/^(?=.*[A-Za-z])[A-Za-z\s.-]+$/)
    .required()
    .messages({
      "any.required": "City is required",
      "string.empty": "City cannot be empty",
      "string.min": "City must be at least 2 characters long",
      "string.max": "City must not exceed 100 characters",
      "string.pattern.base":
        "City must contain only letters and valid characters (space, dot, hyphen)",
    }),
  // Digits only here; the exact rule for the address's country and state is checked on save (locationGuard).
  zip_code: Joi.string().trim().pattern(SUPPORTED_POSTCODE_PATTERN).required().messages({
    "any.required": "Zip code is required",
    "string.pattern.base": SUPPORTED_POSTCODE_MESSAGE,
  }),
  state_id: Joi.string().uuid().required().messages({
    "string.guid": "State ID must be a valid UUID",
    "any.required": "State ID is required",
  }),
  country_id: Joi.string().uuid().required().messages({
    "string.guid": "Country ID must be a valid UUID",
    "any.required": "Country ID is required",
  }),
});

export const upsertCompanySchema = Joi.object({
  name: Joi.string()
    .min(2)
    .max(150)
    .pattern(NAME_PATTERN)
    .optional()
    .messages({
      "any.required": "Company name is required",
      "string.min": "Company name must be at least 2 characters long",
      "string.max": "Company name must not exceed 150 characters",
      "string.pattern.base":
        NAME_PATTERN_MESSAGE,
    }),
  abn_number: Joi.string().min(11).max(11).optional().messages({
    "string.min": "ABN number must be at least 11 characters long",
    "string.max": "ABN number must not exceed 11 characters",
  }),
  timezone_id: Joi.string().uuid().optional().messages({
    "string.guid": "timezone ID must be a valid UUID",
    "any.required": "timezone ID is required",
  }),
  address: addressSchema.optional().messages({
    "any.required": "Address is required",
  }),
  bank_name: Joi.string()
    .min(2)
    .max(150)
    .pattern(NAME_PATTERN)
    .allow(null, "")
    .optional()
    .messages({
      "string.pattern.base": NAME_PATTERN_MESSAGE,
      "string.min": "Bank name must be at least 2 characters long",
      "string.max": "Bank name must not exceed 150 characters",
    }),
  account_name: Joi.string()
    .min(2)
    .max(150)
    .pattern(NAME_PATTERN)
    .allow(null, "")
    .optional()
    .messages({
      "string.pattern.base": NAME_PATTERN_MESSAGE,
      "string.min": "Account name must be at least 2 characters long",
      "string.max": "Account name must not exceed 150 characters",
    }),
  account_number: Joi.string().min(6).max(10).allow(null, "").optional().messages({
    "string.min": "Account number must be at least 6 characters long",
    "string.max": "Account number must not exceed 10 characters",
  }),
  account_bsb: Joi.string().min(6).max(6).allow(null, "").optional().messages({
    "string.min": "Account BSB must be at least 6 characters long",
    "string.max": "Account BSB must not exceed 6 characters",
  }),
  email_signature_logo: Joi.string().max(500).allow(null, "").optional(),
  company_logo: Joi.string().max(500).allow(null, "").optional(),
  website: Joi.string().trim().uri().optional().allow(null, ""),
});

export default { upsertCompanySchema };
