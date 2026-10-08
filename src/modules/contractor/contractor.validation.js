import Joi from "joi";

// Reusable rules
const nameRule = Joi.string().min(2).max(100).trim().messages({
  "string.base": "Name must be a string",
  "string.empty": "Name is required",
  "string.min": "Name must be at least 2 characters long",
  "string.max": "Name must not exceed 100 characters",
  "any.required": "Name is required",
});

const emailRule = Joi.string().email().lowercase().trim().messages({
  "string.base": "Email must be a string",
  "string.empty": "Email is required",
  "string.email": "Please provide a valid email address",
  "any.required": "Email is required",
});

const phoneRule = Joi.string().pattern(/^[0-9]{10,15}$/).messages({
  "string.base": "Phone must be a string",
  "string.pattern.base": "Phone must contain only digits and be 10-15 characters long",
  "any.required": "Phone is required",
});

const addressRule = Joi.string().min(10).max(500).trim().messages({
  "string.base": "Address must be a string",
  "string.empty": "Address is required",
  "string.min": "Address must be at least 10 characters long",
  "string.max": "Address must not exceed 500 characters",
  "any.required": "Address is required",
});

const builderIdRule = Joi.string().uuid().messages({
  "string.base": "Builder ID must be a string",
  "string.empty": "Builder ID is required",
  "string.guid": "Builder ID must be a valid UUID",
  "any.required": "Builder ID is required",
});

const contractorIdRule = Joi.string().uuid().messages({
  "string.base": "Contractor ID must be a string",
  "string.empty": "Contractor ID is required",
  "string.guid": "Contractor ID must be a valid UUID",
  "any.required": "Contractor ID is required",
});

// Create contractor validation
export const createContractorSchema = Joi.object({
  name: nameRule.required(),
  email: emailRule.required(),
  phone: phoneRule.required(),
  address: addressRule.required(),
  service: Joi.string().required(),
});

// Get contractor by ID validation (params)
export const getContractorByIdSchema = Joi.object({
  id: contractorIdRule.required(),
});

// Update contractor validation
export const updateContractorSchema = Joi.object({
  name: nameRule.optional(),
  phone: phoneRule.optional(),
  address: addressRule.optional(),
  service: Joi.string().optional(),
}).min(1).messages({
  "object.min": "At least one field is required to update",
});

// Update contractor params validation
export const updateContractorParamsSchema = Joi.object({
  id: contractorIdRule.required(),
});

// Delete contractor validation (params)
export const deleteContractorSchema = Joi.object({
  id: contractorIdRule.required(),
});

export default {
  createContractorSchema,
  getContractorByIdSchema,
  updateContractorSchema,
  updateContractorParamsSchema,
  deleteContractorSchema,
};
