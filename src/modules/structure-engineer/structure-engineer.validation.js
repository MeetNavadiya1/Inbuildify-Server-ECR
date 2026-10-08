import Joi from "joi";

const phoneRule = Joi.string()
  .min(10)
  .max(17)
  .optional()
  .allow(null, "")
  .pattern(/^(?:\+?61\s*\(?|0\s*\(?|\(0)[2-57-8]\)?\s*(?:[ -]?\d){8}$/)
  .messages({
    "string.min": "Phone must be at least 10 characters long",
    "string.max": "Phone must not exceed 17 characters",
    "string.pattern.base": "Please provide a valid Australian phone number",
  });
export const createStructureEngineerSchema = Joi.object({
  name: Joi.string().max(255).required().messages({
    "any.required": "Name is required",
    "string.empty": "Name cannot be empty",
  }),
  email: Joi.string().email().allow(null, "").max(255).required().messages({
    "string.email": "Email must be a valid email address",
  }),
  phone: phoneRule,
  price: Joi.number().min(2).required().messages({
    "any.required": "price is required",
    "number.base": "price must be a number",
    "number.min": "price cannot be negative",
  }),
  address: Joi.string().allow(null, "").max(500).optional(),
  is_active: Joi.boolean().default(true).optional(),
});

export const updateStructureEngineerSchema = Joi.object({
  name: Joi.string().max(255).optional(),
  email: Joi.string().email().allow(null, "").max(255).optional().messages({
    "string.email": "Email must be a valid email address",
  }),
  phone: phoneRule,
  // Optional on update so partial edits (e.g. a status toggle) don't have to
  // resend price. null is tolerated and coalesced to 0 in the service.
  price: Joi.number().min(0).allow(null).optional(),
  address: Joi.string().allow(null, "").max(500).optional(),
  is_active: Joi.boolean().optional(),
});

export const getStructureEngineerByIdSchema = Joi.object({
  structure_engineer_id: Joi.string().uuid().required().messages({
    "string.guid": "Structure Engineer ID must be a valid UUID",
    "any.required": "Structure Engineer ID is required",
  }),
});

export const getAllStructureEngineerSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).default(25),
  search: Joi.string().allow(null, "").optional(),
});

export const deleteStructureEngineerSchema = Joi.object({
  structure_engineer_id: Joi.string().uuid().required().messages({
    "string.guid": "Structure Engineer ID must be a valid UUID",
    "any.required": "Structure Engineer ID is required",
  }),
});

export default {
  createStructureEngineerSchema,
  updateStructureEngineerSchema,
  getStructureEngineerByIdSchema,
  getAllStructureEngineerSchema,
  deleteStructureEngineerSchema,
};
