import Joi from "joi";
import { phoneRule } from "../lead/leads.validation.js";
import { SUPPORTED_POSTCODE_MESSAGE, SUPPORTED_POSTCODE_PATTERN } from "../city/city.data.js";
import { ADDRESS_PATTERN, ADDRESS_PATTERN_MESSAGE } from "../../utils/validationPatterns.js";
/* ============================================================
    COMMON RULES
============================================================ */

const uuidRule = Joi.string()
  .guid({ version: ["uuidv4", "uuidv1"] })
  .messages({ "string.guid": "Invalid UUID format." });

const nameRule = Joi.string().min(2).max(100).required().messages({
  "string.base": "Name must be a string",
  "string.min": "Name must be at least 2 characters",
  "string.max": "Name must not exceed 100 characters",
  "any.required": "Name is required",
});

const emailRule = Joi.string().email().trim().lowercase().required().messages({
  "string.email": "Email must be valid",
  "any.required": "Email is required",
});

// const phoneRule = Joi.string()
//   .pattern(/^[0-9]{8,15}$/)
//   .allow(null, "")
//   .messages({
//     "string.pattern.base": "Phone must be 8–15 digits only",
//   });

const remarkRule = Joi.string().allow(null, "").max(500);

const addressJsonRule = Joi.object({
  address_line1: Joi.string()
    .min(2)
    .max(255)
    .pattern(ADDRESS_PATTERN)
    .optional(),
  address_line2: Joi.string()
    .min(2)
    .max(255)
    .pattern(ADDRESS_PATTERN)
    .allow("", null),
  city: Joi.string()
    .min(2)
    .max(100)
    .pattern(/^(?=.*[a-zA-Z])[a-zA-Z0-9\s,./#-]+$/)
    .allow("", null),
  // Digits only here; the exact rule for the address's country and state is checked on save (locationGuard).
  zip_code: Joi.alternatives().try(
    Joi.string()
      .optional()
      .pattern(SUPPORTED_POSTCODE_PATTERN)
      .messages({ "string.pattern.base": SUPPORTED_POSTCODE_MESSAGE }),
  ),
  country_id: uuidRule.allow(null),
  state_id: uuidRule.allow(null),
}).allow(null);

/* ============================================================
    CREATE CONTACT
============================================================ */

export const createContactSchema = Joi.object({
  name: nameRule,
  email: emailRule,
  phone: phoneRule,
  secondary_phone: phoneRule,
  remark: remarkRule,
  role_id: uuidRule.optional(),
  address: addressJsonRule,
});

/* ============================================================
    UPDATE CONTACT
============================================================ */

export const updateContactSchema = Joi.object({
  name: nameRule.optional(),
  email: emailRule.optional(),
  phone: phoneRule.optional(),
  secondary_phone: phoneRule.optional(),
  remark: remarkRule.optional(),
  is_active: Joi.boolean().optional(),
  address: addressJsonRule.optional(),
});

/* ============================================================
    CONVERT CONTACT → USER
============================================================ */

export const convertContactSchema = Joi.object({
  role_id: uuidRule.required().messages({
    "any.required": "Role ID is required to convert a contact into a user.",
  }),
});

/* ============================================================
    GET CONTACT LIST
============================================================ */

export const getContactsSchema = Joi.object({
  search: Joi.string().allow("", null).max(100).messages({
    "string.max": "Search term cannot exceed 100 characters",
  }),
  is_active: Joi.boolean().optional().messages({
    "boolean.base": "is_active must be a boolean value",
  }),
  // Only contacts who are the customer on at least one job.
  only_customers: Joi.boolean().optional().messages({
    "boolean.base": "only_customers must be a boolean value",
  }),
  portal_access: Joi.string()
    .valid("all", "loginActive", "loginInactive", "noLogin")
    .optional()
    .messages({
      "any.only": "portal_access must be one of all, loginActive, loginInactive, noLogin",
    }),
});

export default {
  createContactSchema,
  updateContactSchema,
  convertContactSchema,
  getContactsSchema,
};
