import Joi from "joi";
import { phoneRule } from "../lead/leads.validation.js";

/**
 * Mirrors the old `createPublicLeadSchema` so the deployed landing site keeps
 * validating, minus the hard `builder_id` requirement — an enquiry with no
 * resolvable owner is still worth capturing; the admin picks a builder when the
 * lead is released.
 */
export const captureLandingLeadSchema = Joi.object({
  name: Joi.string().min(2).max(255).required().messages({
    "string.min": "Name must be at least 2 characters long",
    "string.max": "Name must not exceed 255 characters",
    "any.required": "Name is required",
  }),
  email: Joi.string().email().max(255).required().allow(null, "").messages({
    "string.email": "Please provide a valid email address",
    "string.max": "Email must not exceed 255 characters",
    "any.required": "Email is required",
  }),
  phone: phoneRule,
  //  Joi.string().min(10).max(14).required().messages({
  //   "string.min": "Phone must be at least 10 characters long",
  //   "string.max": "Phone must not exceed 14 characters",
  //   "any.required": "Phone is required",
  // }),
  notes: Joi.string().max(1000).optional().allow(null, "").messages({
    "string.max": "Notes must not exceed 1000 characters",
  }),
  builder_id: Joi.string().uuid().optional().allow(null, "").messages({
    "string.guid": "Builder ID must be a valid UUID",
  }),
  company_id: Joi.string().uuid().optional().allow(null, "").messages({
    "string.guid": "Company ID must be a valid UUID",
  }),
  featur_facade_id: Joi.string().uuid().optional().allow(null, "").messages({
    "string.guid": "Facade ID must be a valid UUID",
  }),
  source: Joi.string().max(50).optional().allow(null, ""),
  page_url: Joi.string().max(500).optional().allow(null, ""),
  utm_source: Joi.string().max(120).optional().allow(null, ""),
  utm_medium: Joi.string().max(120).optional().allow(null, ""),
  utm_campaign: Joi.string().max(120).optional().allow(null, ""),
}).messages({
  "object.unknown": "Only specified fields are allowed on a landing enquiry",
});

/**
 * The landing site's "Try it" form. Four fields, and unlike the facade enquiry
 * every one of them is required — this becomes a real user account, so a request
 * with no phone number or half a name is not something an admin can release.
 */
export const captureSignupRequestSchema = Joi.object({
  first_name: Joi.string().trim().min(2).max(100).required().messages({
    "string.empty": "First name is required",
    "string.min": "First name must be at least 2 characters long",
    "string.max": "First name must not exceed 100 characters",
    "any.required": "First name is required",
  }),
  last_name: Joi.string().trim().min(1).max(100).required().messages({
    "string.empty": "Last name is required",
    "string.max": "Last name must not exceed 100 characters",
    "any.required": "Last name is required",
  }),
  email: Joi.string().email().max(255).lowercase().trim().required().messages({
    "string.empty": "Email is required",
    "string.email": "Please provide a valid email address",
    "any.required": "Email is required",
  }),
  // Australian numbers arrive as "0480 148 707", "+61 480 148 707" or
  // "0480148707", so spaces, brackets and a leading + are all allowed and the
  // length is measured loosely rather than pinned to one national format.
  phone: Joi.string()
    .trim()
    .min(8)
    .max(20)
    .pattern(/^[+]?[0-9\s()-]+$/)
    .required()
    .messages({
      "string.empty": "Contact number is required",
      "string.min": "Contact number must be at least 8 characters long",
      "string.max": "Contact number must not exceed 20 characters",
      "string.pattern.base": "Contact number may only contain digits, spaces, brackets, + and -",
      "any.required": "Contact number is required",
    }),
  message: Joi.string().max(1000).optional().allow(null, "").messages({
    "string.max": "Message must not exceed 1000 characters",
  }),
  source: Joi.string().max(50).optional().allow(null, ""),
  page_url: Joi.string().max(500).optional().allow(null, ""),
  utm_source: Joi.string().max(120).optional().allow(null, ""),
  utm_medium: Joi.string().max(120).optional().allow(null, ""),
  utm_campaign: Joi.string().max(120).optional().allow(null, ""),
}).messages({
  "object.unknown": "Only specified fields are allowed on a sign-up request",
});

/**
 * The landing site's "Book a Demo" form.
 *
 * Name, email and phone are required — somebody has to ring them to book the
 * thing. Company and company type are not: they sharpen the call, and a visitor
 * who will not type them is still a demo worth taking.
 *
 * The phone rule is copied from the sign-up request above, deliberately, not
 * from `captureLandingLeadSchema` — that one caps at 14 characters and rejects
 * "+61 480 148 707".
 */
export const captureDemoRequestSchema = Joi.object({
  name: Joi.string().trim().min(2).max(255).required().messages({
    "string.empty": "Name is required",
    "string.min": "Name must be at least 2 characters long",
    "string.max": "Name must not exceed 255 characters",
    "any.required": "Name is required",
  }),
  email: Joi.string().email().max(255).lowercase().trim().required().messages({
    "string.empty": "Email is required",
    "string.email": "Please provide a valid email address",
    "string.max": "Email must not exceed 255 characters",
    "any.required": "Email is required",
  }),
  phone: Joi.string()
    .trim()
    .min(8)
    .max(20)
    .pattern(/^[+]?[0-9\s()-]+$/)
    .required()
    .messages({
      "string.empty": "Contact number is required",
      "string.min": "Contact number must be at least 8 characters long",
      "string.max": "Contact number must not exceed 20 characters",
      "string.pattern.base": "Contact number may only contain digits, spaces, brackets, + and -",
      "any.required": "Contact number is required",
    }),
  company: Joi.string().trim().max(255).optional().allow(null, "").messages({
    "string.max": "Company must not exceed 255 characters",
  }),
  // Free text, not a Joi enum: the option list belongs to the landing form, and
  // marketing renaming "Contractor / trade" must not need a backend release.
  company_type: Joi.string().trim().max(60).optional().allow(null, "").messages({
    "string.max": "Company type must not exceed 60 characters",
  }),
  message: Joi.string().max(1000).optional().allow(null, "").messages({
    "string.max": "Message must not exceed 1000 characters",
  }),
  source: Joi.string().max(50).optional().allow(null, ""),
  page_url: Joi.string().max(500).optional().allow(null, ""),
  utm_source: Joi.string().max(120).optional().allow(null, ""),
  utm_medium: Joi.string().max(120).optional().allow(null, ""),
  utm_campaign: Joi.string().max(120).optional().allow(null, ""),
}).messages({
  "object.unknown": "Only specified fields are allowed on a demo request",
});

export default { captureLandingLeadSchema, captureSignupRequestSchema, captureDemoRequestSchema };
