import Joi from "joi";
import { SUPPORTED_POSTCODE_MESSAGE, SUPPORTED_POSTCODE_PATTERN } from "../city/city.data.js";
import { NAME_PATTERN, NAME_PATTERN_MESSAGE } from "../../utils/validationPatterns.js";

export const createPropertyParamSchema = Joi.object({
  leads_id: Joi.string().uuid().required().messages({
    "string.guid": "Leads ID must be a valid UUID",
    "any.required": "Leads ID is required",
  }),
});

const compactionReportContentSchema = Joi.object({
  land_type: Joi.string()
    .valid("Rocky", "Sloping", "Plain", "Uneven", "Filled Land")
    .optional(),

  ground_level: Joi.string()
    .valid("Above Road Level", "At Road Level", "Below Road Level")
    .optional(),

  slope_condition: Joi.string()
    .valid("Flat", "Gentle Slope", "Steep Slope")
    .optional(),

  soil_type: Joi.string()
    .valid("Clay", "Sand", "Silt", "Gravel", "Mixed")
    .optional(),

  soil_class: Joi.string()
    .valid("A", "S", "M", "H1", "H2", "E", "P")
    .optional(),

  moisture_content: Joi.number()
    .min(0)
    .max(100)
    .precision(2)
    .required()
    .messages({
      "number.base": "Moisture Content must be a valid number.",
      "number.min": "Moisture Content cannot be less than 0.",
      "number.max": "Moisture Content cannot exceed 100.",
    }),

  dry_density: Joi.number()
    .min(0)
    .max(99999)
    .precision(2)
    .required()
    .messages({
      "number.base": "Dry Density must be a valid number.",
      "number.max": "Dry Density is too large.",
    }),

  max_dry_density: Joi.number()
    .min(0)
    .max(99999)
    .precision(2)
    .required()
    .messages({
      "number.base": "Max Dry Density must be a valid number.",
      "number.max": "Max Dry Density is too large.",
    }),

  compaction: Joi.number()
    .min(0)
    .max(100)
    .precision(2)
    .required()
    .messages({
      "number.base": "Compaction must be a valid number.",
      "number.min": "Compaction cannot be less than 0.",
      "number.max": "Compaction cannot exceed 100.",
    }),

  result: Joi.string()
    .valid("pass", "fail")
    .required()
    .messages({
      "any.only": "Result must be either pass or fail.",
    }),

  engineer_name: Joi.string()
    .trim()
    .pattern(NAME_PATTERN)
    .min(2)
    .max(100)
    .required()
    .messages({
      "string.empty": "Engineer Name is required.",
      "string.min": "Engineer Name must be at least 2 characters.",
      "string.max": "Engineer Name cannot exceed 100 characters.",
      "string.pattern.base": NAME_PATTERN_MESSAGE,
      "any.required": "Engineer Name is required.",
    }),

  remarks: Joi.string()
    .trim()
    .max(500)
    .allow("", null)
    .required()
    .messages({
      "string.max": "Remarks cannot exceed 500 characters.",
    }),
});

export const createPropertySchema = Joi.object({
  lot_number: Joi.string()
    .trim()
    .max(20)
    .allow("", null)
    .optional(),

  street: Joi.string()
    .trim()
    .max(100)
    .allow("", null)
    .optional(),

  address_line1: Joi.string()
    .trim()
    .max(150)
    .allow("", null)
    .optional(),

  address_line2: Joi.string()
    .trim()
    .max(100)
    .allow("", null)
    .optional(),

  city: Joi.string()
    .trim()
    .max(100)
    .allow("", null)
    .optional(),

  state_id: Joi.string()
    .uuid()
    .allow(null)
    .optional()
    .messages({
      "string.guid": "State ID must be a valid UUID.",
    }),

  country_id: Joi.string()
    .uuid()
    .allow(null)
    .optional()
    .messages({
      "string.guid": "Country ID must be a valid UUID.",
    }),

  // Digits only here; the exact rule for the property's country and state is checked on save (locationGuard).
  zip_code: Joi.string()
    .trim()
    .pattern(SUPPORTED_POSTCODE_PATTERN)
    .allow("", null)
    .optional()
    .messages({
      "string.pattern.base": SUPPORTED_POSTCODE_MESSAGE,
    }),

  estate_name: Joi.string()
    .trim()
    .max(100)
    .allow("", null)
    .optional(),

  title_status: Joi.string()
    .valid(
      "available",
      "sold",
      "reserved",
      "pending",
      "under_contract",
      "off_market"
    )
    .allow("", null)
    .optional(),

  title_date: Joi.date()
    .allow(null)
    .optional(),

  compaction_report: Joi.string()
    .valid("available", "not_available")
    .allow("", null)
    .optional(),

  compaction_report_url: Joi.string()
    .trim()
    .max(500)
    .allow("", null)
    .optional(),

  compaction_report_content: compactionReportContentSchema
    .allow(null)
    .when("compaction_report", {
      is: "available",
      then: Joi.optional(),
      otherwise: Joi.forbidden(),
    }),

  land_type: Joi.string()
    .valid("regular", "irregular")
    .default("regular"),

  width_m: Joi.number()
    .precision(2)
    .min(0)
    .max(99999.99)
    .allow(null)
    .optional(),

  depth_m: Joi.number()
    .precision(2)
    .min(0)
    .max(99999.99)
    .allow(null)
    .optional(),

  total_size_m2: Joi.number()
    .precision(2)
    .min(0)
    .max(9999999.99)
    .allow(null)
    .optional(),

  site_fall_mm: Joi.number()
    .precision(2)
    .min(0)
    .max(999999)
    .allow(null)
    .optional(),

  land_fill_mm: Joi.number()
    .precision(2)
    .min(0)
    .max(999999)
    .allow(null)
    .optional(),

  bush_fire: Joi.boolean().default(false),

  corner_block: Joi.boolean().default(false),

  clearing_date: Joi.date()
    .allow(null)
    .optional(),

  compaction_report_provider: Joi.string()
    .valid("self", "builder")
    .when("compaction_report", {
      is: "not_available",
      then: Joi.required(),
      otherwise: Joi.forbidden(),
    }),
});

export const updatePropertySchema = Joi.object({
  lot_number: Joi.string()
    .trim()
    .max(20)
    .allow("", null)
    .optional(),

  street: Joi.string()
    .trim()
    .max(100)
    .allow("", null)
    .optional(),

  address_line1: Joi.string()
    .trim()
    .max(150)
    .allow("", null)
    .optional(),

  address_line2: Joi.string()
    .trim()
    .max(100)
    .allow("", null)
    .optional(),

  city: Joi.string()
    .trim()
    .max(100)
    .allow("", null)
    .optional(),

  state_id: Joi.string()
    .uuid()
    .allow(null)
    .optional()
    .messages({
      "string.guid": "State ID must be a valid UUID.",
    }),

  country_id: Joi.string()
    .uuid()
    .allow(null)
    .optional()
    .messages({
      "string.guid": "Country ID must be a valid UUID.",
    }),

  // Digits only here; the exact rule for the property's country and state is checked on save (locationGuard).
  zip_code: Joi.string()
    .trim()
    .pattern(SUPPORTED_POSTCODE_PATTERN)
    .allow("", null)
    .optional()
    .messages({
      "string.pattern.base": SUPPORTED_POSTCODE_MESSAGE,
    }),

  estate_id: Joi.string()
    .uuid()
    .allow(null)
    .optional()
    .messages({
      "string.guid": "Estate ID must be a valid UUID.",
    }),

  estate_stage_id: Joi.string()
    .uuid()
    .allow(null)
    .optional()
    .messages({
      "string.guid": "Estate Stage ID must be a valid UUID.",
    }),

  estate_name: Joi.string()
    .trim()
    .max(100)
    .allow("", null)
    .optional(),

  title_status: Joi.string()
    .valid(
      "available",
      "sold",
      "reserved",
      "pending",
      "under_contract",
      "off_market"
    )
    .allow("", null)
    .optional(),

  title_date: Joi.date()
    .allow(null)
    .optional(),

  compaction_report: Joi.string()
    .valid("available", "not_available")
    .allow("", null)
    .optional(),

  compaction_report_url: Joi.string()
    .trim()
    .max(500)
    .allow("", null)
    .optional(),

  compaction_report_content: compactionReportContentSchema
    .allow(null)
    .optional(),

  land_type: Joi.string()
    .valid("regular", "irregular")
    .optional(),

  width_m: Joi.number()
    .precision(2)
    .min(0)
    .max(99999.99)
    .allow(null)
    .optional(),

  depth_m: Joi.number()
    .precision(2)
    .min(0)
    .max(99999.99)
    .allow(null)
    .optional(),

  total_size_m2: Joi.number()
    .precision(2)
    .min(0)
    .max(9999999.99)
    .allow(null)
    .optional(),

  site_fall_mm: Joi.number()
    .precision(2)
    .min(0)
    .max(999999)
    .allow(null)
    .optional(),

  land_fill_mm: Joi.number()
    .precision(2)
    .min(0)
    .max(999999)
    .allow(null)
    .optional(),

  bush_fire: Joi.boolean().optional(),

  corner_block: Joi.boolean().optional(),

  price: Joi.number()
    .precision(2)
    .min(0)
    .max(999999999.99)
    .allow(null)
    .optional(),

  clearing_date: Joi.date()
    .allow(null)
    .optional(),

  compaction_report_provider: Joi.string()
    .valid("self", "builder")
    .when("compaction_report", {
      is: "not_available",
      then: Joi.required(),
      otherwise: Joi.forbidden(),
    }),
});

export const getPropertyByLeadSchema = Joi.object({
  leads_id: Joi.string().uuid().required().messages({
    "string.guid": "Lead ID must be a valid UUID",
    "any.required": "Lead ID is required",
  }),
});

export const updatePropertyParamSchema = Joi.object({
  property_detail_id: Joi.string().uuid().required().messages({
    "string.guid": "Property ID must be a valid UUID",
    "any.required": "Property ID is required",
  }),
});

export const deletePropertySchema = Joi.object({
  property_detail_id: Joi.string().uuid().required().messages({
    "string.guid": "Property Detail ID must be a valid UUID",
    "any.required": "Property Detail ID is required",
  }),
});

export default {
  createPropertySchema,
  getPropertyByLeadSchema,
  updatePropertySchema,
  updatePropertyParamSchema,
  deletePropertySchema,
};
