import Joi from "joi";
import { SUPPORTED_POSTCODE_MESSAGE, SUPPORTED_POSTCODE_PATTERN } from "../city/city.data.js";

export const createBusinessContactSchema = Joi.object({
  leads_id: Joi.string().uuid().allow(null).optional(),
  contact_type: Joi.string()
    .valid("company", "conveyancer", "mortgage_broker", "financer")
    .messages({
      "any.only": "Invalid contact type. Must be one of: company, conveyancer, mortgage_broker, financer",
    })
    .required(),
  name: Joi.string().min(2).max(255).required(),
  email: Joi.string().email().allow(null, "").optional(),
  phone: Joi.string().max(20).allow(null, "").optional(),
  address1: Joi.string().min(2).max(255).allow(null, "").optional(),
  address2: Joi.string().min(2).max(255).allow(null, "").optional(),
  city: Joi.string().min(2).max(100).allow(null, "").optional(),
  // Digits only here; the exact rule for the contact's country and state is checked on save (locationGuard).
  zip_code: Joi.string()
    .pattern(SUPPORTED_POSTCODE_PATTERN)
    .allow(null, "")
    .optional()
    .messages({ "string.pattern.base": SUPPORTED_POSTCODE_MESSAGE }),
  country_id: Joi.string().uuid().allow(null).optional(),
  state_id: Joi.string().uuid().allow(null).optional(),
  abn_number: Joi.string().min(11).max(11).allow(null, "").optional(),
  acn_number: Joi.string().min(9).max(9).allow(null, "").optional(),
});

export const getAllBusinessContactsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(25),
});

export const getBusinessContactByIdSchema = Joi.object({
  business_contact_id: Joi.string().uuid().required(),
});

export const getBusinessContactsByLeadsIdSchema = Joi.object({
  leads_id: Joi.string().uuid().required(),
});

export const updateBusinessContactSchema = Joi.object({
  name: Joi.string().min(2).max(255).optional(),
  email: Joi.string().email().allow(null, "").optional(),
  phone: Joi.string().max(20).allow(null, "").optional(),
  address1: Joi.string().min(2).max(255).allow(null, "").optional(),
  address2: Joi.string().min(2).max(255).allow(null, "").optional(),
  city: Joi.string().min(2).max(100).allow(null, "").optional(),
  // Digits only here; the exact rule for the contact's country and state is checked on save (locationGuard).
  zip_code: Joi.string()
    .pattern(SUPPORTED_POSTCODE_PATTERN)
    .allow(null, "")
    .optional()
    .messages({ "string.pattern.base": SUPPORTED_POSTCODE_MESSAGE }),
  country_id: Joi.string().uuid().allow(null, "").optional(),
  state_id: Joi.string().uuid().allow(null, "").optional(),
  abn_number: Joi.string().min(11).max(11).allow(null, "").optional(),
  acn_number: Joi.string().min(9).max(9).allow(null, "").optional(),
});

export const deleteBusinessContactSchema = Joi.object({
  business_contact_id: Joi.string().uuid().required(),
});

export default {
  createBusinessContactSchema,
  getAllBusinessContactsSchema,
  getBusinessContactByIdSchema,
  getBusinessContactsByLeadsIdSchema,
  updateBusinessContactSchema,
  deleteBusinessContactSchema,
};
