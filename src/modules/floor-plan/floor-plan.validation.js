import Joi from "joi";
import { NAME_PATTERN, NAME_PATTERN_MESSAGE } from "../../utils/validationPatterns.js";

const imageRule = Joi.alternatives()
  .try(
    Joi.string().uri().max(500).trim().messages({
      "string.base": "Image must be a string",
      "string.uri": "Image must be a valid URL",
      "string.max": "Image URL must not exceed 500 characters",
    }),
    Joi.object({
      fieldname: Joi.string().valid("image").required(),
      originalname: Joi.string().required(),
      mimetype: Joi.string().required(),
      size: Joi.number()
        .max(10 * 1024 * 1024)
        .required(), // enforce max 10MB
      location: Joi.string().uri().required(), // s3 URL added by multer-s3
    }).unknown(true), // allow extra multer fields
  )
  .optional();

const floorPlanIdRule = Joi.string().uuid().messages({
  "string.base": "Floor plan ID must be a string",
  "string.empty": "Floor plan ID is required",
  "string.guid": "Floor plan ID must be a valid UUID",
  "any.required": "Floor plan ID is required",
});

const pageRule = Joi.number().integer().min(1).default(1).messages({
  "number.base": "Page must be a number",
  "number.integer": "Page must be an integer",
  "number.min": "Page must be greater than 0",
});

const limitRule = Joi.number().integer().min(1).max(100).default(10).messages({
  "number.base": "Limit must be a number",
  "number.integer": "Limit must be an integer",
  "number.min": "Limit must be at least 1",
  "number.max": "Limit must not exceed 100",
});

export const createFloorPlanSchema = Joi.object({
  name: Joi.string()
    .min(2)
    .max(100)
    .pattern(NAME_PATTERN)
    .required(),

  min_land_width: Joi.number()
    .min(0)
    .max(999999.99)
    .precision(2)
    .allow(null, ""),
  min_land_depth: Joi.number()
    .min(0)
    .precision(2)
    .max(999999.99)
    .allow(null, ""),
  dwelling_area: Joi.number()
    .precision(2)
    .min(0)
    .max(99999999.99)
    .allow(null, ""),

  dwelling_type_id: Joi.string().uuid().optional().messages({
    "string.guid": "Dwelling type ID must be a valid UUID",
  }),

  beds: Joi.number().integer().min(0).max(100000).allow(null, ""),
  baths: Joi.number().integer().min(0).max(100000).allow(null, ""),
  carpark: Joi.number().integer().min(0).max(100000).allow(null, ""),
  living: Joi.number().integer().min(0).max(100000).allow(null, ""),

  range_id: Joi.string().uuid().optional().messages({
    "string.guid": "Range ID must be a valid UUID",
  }),

  garage_area: Joi.number()
    .min(0)
    .max(99999999.99)
    .precision(2)
    .allow(null, ""),
  porch_area: Joi.number().min(0).max(99999999.99).precision(2).allow(null, ""),
  alfresco_area: Joi.number()
    .min(0)
    .max(999999.99)
    .precision(2)
    .allow(null, ""),
  total_area: Joi.number().min(0).max(99999999.99).precision(2).allow(null, ""),

  detailed_image: imageRule.optional(),
  simple_image: imageRule.optional(),

  description: Joi.string().allow(null, "").max(500),
  status: Joi.boolean().default(true),
});

export const getFloorPlansSchema = Joi.object({
  name: Joi.string().max(100).optional(),
  dwelling_type_id: Joi.string().uuid().allow("", null).optional().messages({
    "string.guid": "Dwelling type ID must be a valid UUID",
  }),
  range_id: Joi.string().uuid().optional().allow("", null).messages({
    "string.guid": "Range ID must be a valid UUID",
  }),
  location_id: Joi.string().uuid().optional().allow("", null).messages({
    "string.guid": "Location ID must be a valid UUID",
  }),

  status: Joi.boolean().optional(),
  page: pageRule,
  limit: limitRule,
});

export const updateFloorPlanSchema = Joi.object({
  name: Joi.string()
    .min(2)
    .max(100)
    .pattern(NAME_PATTERN)
    .optional(),

  min_land_width: Joi.number()
    .min(0)
    .max(999999.99)
    .precision(2)
    .allow(null, "")
    .optional(),
  min_land_depth: Joi.number()
    .precision(2)
    .min(0)
    .max(999999.99)
    .allow(null, "")
    .optional(),
  dwelling_area: Joi.number()
    .precision(2)
    .min(0)
    .max(99999999.99)
    .allow(null, "")
    .optional(),

  dwelling_type_id: Joi.string().uuid().optional().messages({
    "string.guid": "Dwelling type ID must be a valid UUID",
  }),

  beds: Joi.number().integer().min(0).max(100000).allow(null, "").optional(),
  baths: Joi.number().integer().min(0).max(100000).allow(null, "").optional(),
  carpark: Joi.number().integer().min(0).max(100000).allow(null, "").optional(),
  living: Joi.number().integer().min(0).max(100000).allow(null, "").optional(),

  range_id: Joi.string().uuid().optional().messages({
    "string.guid": "Range ID must be a valid UUID",
  }),

  location_id: Joi.string().uuid().optional().messages({
    "string.guid": "location ID must be a valid UUID",
  }),
  garage_area: Joi.number()
    .min(0)
    .max(99999999.99)
    .precision(2)
    .allow(null, "")
    .optional(),
  porch_area: Joi.number()
    .min(0)
    .max(99999999.99)
    .precision(2)
    .allow(null, "")
    .optional(),
  alfresco_area: Joi.number()
    .min(0)
    .max(999999.99)
    .precision(2)
    .allow(null, "")
    .optional(),
  total_area: Joi.number()
    .min(0)
    .max(99999999.99)
    .precision(2)
    .allow(null, "")
    .optional(),

  detailed_image: imageRule.optional(),
  simple_image: imageRule.optional(),

  description: Joi.string().allow(null, "").max(500).optional(),
  status: Joi.boolean(),

});

export const updateFloorPlanParamsSchema = Joi.object({
  floor_plan_id: floorPlanIdRule.required(),
});

export const deleteFloorPlanSchema = Joi.object({
  floor_plan_id: floorPlanIdRule.required(),
});

export default {
  createFloorPlanSchema,
  getFloorPlansSchema,
  updateFloorPlanSchema,
  updateFloorPlanParamsSchema,
  deleteFloorPlanSchema,
};
