import Joi from "joi";

const uuidRule = Joi.string().uuid().required().messages({
  "string.guid": "ID must be a valid UUID",
  "any.required": "ID is required",
});

const optionalUuidRule = Joi.string().uuid().optional().allow(null).messages({
  "string.guid": "ID must be a valid UUID",
});

const stringRule = Joi.string().trim().messages({
  "string.base": "Must be a string",
  "string.empty": "Field cannot be empty",
});

const numericRule = Joi.number().precision(2).messages({
  "number.base": "Must be a number",
  "number.positive": "Must be a positive number",
});

const booleanRule = Joi.boolean().optional().messages({
  "boolean.base": "Must be a boolean value",
});

export const createLotSchema = Joi.object({
  estate_id: optionalUuidRule.messages({
    "string.guid": "Estate ID must be a valid UUID",
  }),
  estate_stage_id: optionalUuidRule.messages({
    "string.guid": "Estate stage ID must be a valid UUID",
  }),
  lot_number: stringRule.min(2).max(255).required().messages({
    "any.required": "Lot number is required",
    "string.min": "Lot number must be at least 2 characters long",
    "string.max": "Lot number must not exceed 255 characters",
  }),
  street: stringRule.min(2).max(255).required().messages({
    "any.required": "Street is required",
    "string.min": "Street must be at least 2 characters long",
    "string.max": "Street must not exceed 255 characters",
  }),
  city: stringRule.min(2).max(255).required().messages({
    "any.required": "City is required",
    "string.min": "City must be at least 2 characters long",
    "string.max": "City must not exceed 255 characters",
  }),
  state_id: optionalUuidRule.required().messages({
    "string.guid": "State ID must be a valid UUID",
    "any.required": "State ID is required",
  }),
  zip_code: stringRule.pattern(/^[0-9]{4}$/).required().messages({
    "any.required": "Zip code is required",
    "string.pattern.base": "Invalid Zip / Postal code!",
  }),
  title_status: stringRule
    .max(255)
    .optional()
    .allow("")
    .valid(
      "available",
      "sold",
      "reserved",
      "pending",
      "under_contract",
      "off_market",
    )
    .messages({
      "any.only":
        "Title status must be one of: available, sold, reserved, pending, under_contract, off_market",
    }),
  title_date: Joi.date().optional().allow(null).messages({
    "date.base": "Title date must be a valid date",
  }),
  lot_type: stringRule
    .max(100)
    .optional()
    .allow("")
    .valid("regular", "irregular")
    .default("regular")
    .messages({
      "any.only": "Lot type must be either regular or irregular",
    }),
  corner_block: booleanRule.default(false),
  width_m: numericRule.min(0).optional().allow(null),
  depth_m: numericRule.min(0).optional().allow(null),
  price: numericRule.min(0).optional().allow(null),
  site_fall_mm: numericRule.min(0).optional().allow(null),
  land_fill_mm: numericRule.min(0).optional().allow(null),
  total_size_m2: numericRule.min(0).optional().allow(null),
});

export const updateLotSchema = Joi.object({
  estate_id: optionalUuidRule.messages({
    "string.guid": "Estate ID must be a valid UUID",
  }),
  estate_stage_id: optionalUuidRule.messages({
    "string.guid": "Estate stage ID must be a valid UUID",
  }),
  lot_number: stringRule.min(2).max(255).optional().messages({
    "string.min": "Lot number must be at least 2 characters long",
    "string.max": "Lot number must not exceed 255 characters",
  }),
  street: stringRule.min(2).max(255).optional().messages({
    "string.min": "Street must be at least 2 characters long",
    "string.max": "Street must not exceed 255 characters",
  }),
  city: stringRule.min(2).max(255).optional().messages({
    "string.min": "City must be at least 2 characters long",
    "string.max": "City must not exceed 255 characters",
  }),
  state_id: optionalUuidRule.messages({
    "string.guid": "State ID must be a valid UUID",
  }),
  zip_code: stringRule.pattern(/^[0-9]{4}$/).optional().messages({
    "string.pattern.base": "Invalid Zip / Postal code!",
  }),
  title_status: stringRule
    .max(255)
    .optional()
    .allow("")
    .valid(
      "available",
      "sold",
      "reserved",
      "pending",
      "under_contract",
      "off_market",
    )
    .messages({
      "any.only":
        "Title status must be one of: available, sold, reserved, pending, under_contract, off_market",
    }),
  title_date: Joi.date().optional().allow(null).messages({
    "date.base": "Title date must be a valid date",
  }),
  lot_type: stringRule
    .max(100)
    .optional()
    .allow("")
    .valid("regular", "irregular")
    .messages({
      "any.only": "Lot type must be either regular or irregular",
    }),
  corner_block: booleanRule,
  width_m: numericRule.min(0).optional().allow(null),
  depth_m: numericRule.min(0).optional().allow(null),
  price: numericRule.min(0).optional().allow(null),
  site_fall_mm: numericRule.min(0).optional().allow(null),
  land_fill_mm: numericRule.min(0).optional().allow(null),
  total_size_m2: numericRule.min(0).optional().allow(null),
});

export const getLotByIdSchema = Joi.object({
  lot_id: uuidRule,
});

export const deleteLotSchema = Joi.object({
  lot_id: uuidRule,
});

export const getAllLotsSchema = Joi.object({
  lot_number: stringRule.max(255).optional().allow(""),
  price: Joi.alternatives().try(Joi.number(), Joi.string()).optional().allow(null, ""),
  size: Joi.alternatives().try(Joi.number(), Joi.string()).optional().allow(null, ""),
  estate_name: stringRule.max(255).optional().allow(""),
  stage_name: stringRule.max(255).optional().allow(""),
  address: stringRule.max(255).optional().allow(""),
  status: stringRule
    .valid("available", "sold", "reserved", "pending", "under_contract", "off_market")
    .optional()
    .allow(""),
  created_date: stringRule.valid("past_7_days", "past_14_days", "past_30_days").optional(),
  created_by: optionalUuidRule,
});

export default {
  createLotSchema,
  updateLotSchema,
  getLotByIdSchema,
  deleteLotSchema,
  getAllLotsSchema,
};
