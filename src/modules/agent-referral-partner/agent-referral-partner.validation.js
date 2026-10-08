import Joi from "joi";
import { SUPPORTED_POSTCODE_MESSAGE, SUPPORTED_POSTCODE_PATTERN } from "../city/city.data.js";
import { ADDRESS_PATTERN, ADDRESS_PATTERN_MESSAGE, NAME_PATTERN, NAME_PATTERN_MESSAGE } from "../../utils/validationPatterns.js";

export const createAgentReferralPartnerSchema = Joi.object({
  address: Joi.object({
    address_line1: Joi.string()
      .min(2)
      .max(255)
      .pattern(ADDRESS_PATTERN)
      .allow(""),
    address_line2: Joi.string()
      .min(2)
      .max(255)
      .pattern(ADDRESS_PATTERN)
      .optional()
      .allow(null, ""),
    city: Joi.string()
      .min(2)
      .max(100)
      .pattern(/^(?=.*[a-zA-Z])[a-zA-Z0-9\s,./#-]+$/)
      .allow(""),
    state_id: Joi.string().uuid().allow(null),
    country_id: Joi.string().uuid().allow(null),
    // Digits only here; the exact rule for the address's country and state is checked on save (locationGuard).
    zip_code: Joi.string()
      .pattern(SUPPORTED_POSTCODE_PATTERN)
      .allow("")
      .messages({ "string.pattern.base": SUPPORTED_POSTCODE_MESSAGE }),
  }).optional(),
  user: Joi.object({
    name: Joi.string()
      .min(2)
      .max(100)
      .required()
      .pattern(NAME_PATTERN)
      .messages({
        "string.empty": "Name is required.",
        "string.min": "Name must be at least 2 characters.",
        "string.max": "Name must not exceed 255 characters.",
        "any.required": "Name is required.",
      }),
    email: Joi.string().email().required().messages({
      "string.email": "Please provide a valid email address.",
      "any.required": "Email is required.",
    }),
    phone: Joi.string().min(10).max(17).required().messages({
      "string.empty": "Phone is required.",
      "string.min": "Phone must be at least 10 characters.",
      "string.max": "Phone must not exceed 17 characters.",
      "any.required": "Phone is required.",
    }),
    create_login: Joi.boolean().default(false),
    login_id: Joi.when("create_login", {
      is: true,
      then: Joi.string().min(3).max(100).required().messages({
        "string.empty": "Login ID is required when creating login credentials.",
        "string.min": "Login ID must be at least 3 characters.",
        "string.max": "Login ID must not exceed 100 characters.",
        "any.required": "Login ID is required when creating login credentials.",
      }),
      otherwise: Joi.forbidden().messages({
        "any.unknown":
          "Login ID cannot be provided when create_login is false.",
      }),
    }),
    password_auto_generated: Joi.when("create_login", {
      is: true,
      then: Joi.boolean().default(false),
      otherwise: Joi.forbidden().messages({
        "any.unknown":
          "Password auto generated cannot be provided when create_login is false.",
      }),
    }),
    manual_password: Joi.when("create_login", {
      is: true,
      then: Joi.when("password_auto_generated", {
        is: false,
        then: Joi.string().min(8).required().messages({
          "string.empty":
            "Manual password is required when password auto generated is false.",
          "string.min": "Password must be at least 8 characters.",
          "any.required":
            "Manual password is required when password option is manual.",
        }),
        otherwise: Joi.forbidden().messages({
          "any.unknown":
            "Manual password can only be provided when password option is manual.",
        }),
      }),
      otherwise: Joi.forbidden().messages({
        "any.unknown":
          "Manual password cannot be provided when create_login is false.",
      }),
    }),
    next_login_password_change: Joi.when("create_login", {
      is: true,
      then: Joi.boolean().default(false),
      otherwise: Joi.forbidden().messages({
        "any.unknown":
          "Next login password change cannot be provided when create_login is false.",
      }),
    }),
    email_login_credentials: Joi.when("create_login", {
      is: true,
      then: Joi.boolean().default(false),
      otherwise: Joi.forbidden().messages({
        "any.unknown":
          "Email login credentials cannot be provided when create_login is false.",
      }),
    }),
  }).required(),
  account_name: Joi.string()
    .min(2)
    .max(150)
    .pattern(NAME_PATTERN)
    .allow(null, ""),
  account_bsb: Joi.string().min(6).max(6).allow(null, ""),
  account_number: Joi.string().min(6).max(10).allow(null, ""),
  abn: Joi.string().min(11).max(11).allow(null, ""),
  company_name: Joi.string()
    .min(2)
    .max(150)
    .pattern(NAME_PATTERN)
    .allow(null, ""),
  referred_user_id: Joi.string().uuid().required().messages({
    "string.empty": "Referred user ID is required.",
    "string.uuid": "Referred user ID must be a valid UUID.",
    "any.required": "Referred user ID is required.",
  }),
});

export const updateAgentReferralPartnerSchema = Joi.object({
  address: Joi.object({
    address_line1: Joi.string()
      .min(2)
      .max(255)
      .pattern(ADDRESS_PATTERN)
      .allow(""),
    address_line2: Joi.string()
      .min(2)
      .max(255)
      .pattern(ADDRESS_PATTERN)
      .optional()
      .allow(null, ""),
    city: Joi.string()
      .min(2)
      .max(100)
      .pattern(/^(?=.*[a-zA-Z])[a-zA-Z0-9\s,./#-]+$/)
      .allow(""),
    state_id: Joi.string().uuid().allow(null),
    country_id: Joi.string().uuid().allow(null),
    // Digits only here; the exact rule for the address's country and state is checked on save (locationGuard).
    zip_code: Joi.string()
      .pattern(SUPPORTED_POSTCODE_PATTERN)
      .allow("")
      .messages({ "string.pattern.base": SUPPORTED_POSTCODE_MESSAGE }),
  }).optional(),
  user: Joi.object({
    name: Joi.string()
      .min(2)
      .max(100)
      .pattern(NAME_PATTERN)
      .optional()
      .messages({
        "string.empty": "Name is required.",
        "string.min": "Name must be at least 2 characters.",
        "string.max": "Name must not exceed 100 characters.",
        "any.required": "Name is required.",
      }),
    email: Joi.string().email().optional().messages({
      "string.email": "Please provide a valid email address.",
      "any.required": "Email is required.",
    }),
    phone: Joi.string().min(10).max(17).optional().messages({
      "string.empty": "Phone is required.",
      "string.min": "Phone must be at least 10 characters.",
      "string.max": "Phone must not exceed 17 characters.",
      "any.required": "Phone is required.",
    }),
    create_login: Joi.boolean().optional(),
    login_id: Joi.when("create_login", {
      is: true,
      then: Joi.string().min(3).max(100).required().messages({
        "string.empty": "Login ID is required when creating login credentials.",
        "string.min": "Login ID must be at least 3 characters.",
        "string.max": "Login ID must not exceed 100 characters.",
        "any.required": "Login ID is required when creating login credentials.",
      }),
      otherwise: Joi.forbidden().messages({
        "any.unknown":
          "Login ID cannot be provided when create_login is false.",
      }),
    }),
    password_auto_generated: Joi.when("create_login", {
      is: true,
      then: Joi.boolean().default(false),
      otherwise: Joi.forbidden().messages({
        "any.unknown":
          "Password auto generated cannot be provided when create_login is false.",
      }),
    }),
    manual_password: Joi.when("create_login", {
      is: true,
      then: Joi.when("password_auto_generated", {
        is: false,
        then: Joi.string().min(8).optional(),
        otherwise: Joi.forbidden().messages({
          "any.unknown":
            "Manual password can only be provided when password auto generated is false.",
        }),
      }),
      otherwise: Joi.forbidden().messages({
        "any.unknown":
          "Manual password cannot be provided when create_login is false.",
      }),
    }),
    next_login_password_change: Joi.when("create_login", {
      is: true,
      then: Joi.boolean().optional(),
      otherwise: Joi.forbidden().messages({
        "any.unknown":
          "Next login password change cannot be provided when create_login is false.",
      }),
    }),
    email_login_credentials: Joi.when("create_login", {
      is: true,
      then: Joi.boolean().optional(),
      otherwise: Joi.forbidden().messages({
        "any.unknown":
          "Email login credentials cannot be provided when create_login is false.",
      }),
    }),
    is_active: Joi.boolean().optional(),
  }).optional(),
  account_name: Joi.string()
    .min(2)
    .max(150)
    .pattern(NAME_PATTERN)
    .allow(null, ""),
  account_bsb: Joi.string().min(6).max(6).allow(null, ""),
  account_number: Joi.string().min(6).max(10).allow(null, ""),
  abn: Joi.string().min(11).max(11).allow(null, ""),
  company_name: Joi.string()
    .min(2)
    .max(150)
    .pattern(NAME_PATTERN)
    .allow(null, ""),
  referred_user_id: Joi.string().uuid().allow(null).optional().messages({
    "string.uuid": "Referred user ID must be a valid UUID.",
  }),
});

export const getAgentReferralPartnerSchema = Joi.object({
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

  search: Joi.string().min(1).max(255).optional().allow(null, "").messages({
    "string.base": "Search must be a string",
    "string.min": "Search must be at least 1 character",
    "string.max": "Search must not exceed 255 characters",
  }),

  is_active: Joi.boolean().optional().messages({
    "boolean.base": "is_active must be a boolean",
  }),
});

export const paramsIdSchema = Joi.object({
  partner_id: Joi.string().uuid().required().messages({
    "string.guid": "agent ID must be a valid UUID",
    "any.required": "agent ID is required",
  }),
});

export default {
  createAgentReferralPartnerSchema,
  updateAgentReferralPartnerSchema,
  getAgentReferralPartnerSchema,
  paramsIdSchema,
};
