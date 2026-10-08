import Joi from "joi";

const validConditions = ["site_fall", "land_size", "corner_block", "land_fill"];
const UOM_VALUES = [
  "SQ_FT",
  "SQ_M",
  "SQ_YD",
  "ACRE",
  "HECTARE",
  "CUBIC_METER",
  "CUBIC_FEET",
  "KG",
  "TON",
  "METER",
  "FEET",
  "NOS",
  "UNITS",
  "LITER",
];

const conditionSchema = Joi.object({
  condition_name: Joi.string()
    .valid(...validConditions)
    .required()
    .messages({
      "any.only":
        "condition_name must be one of: site_fall, land_size, corner_block, land_fill",
      "any.required": "condition_name is required",
    }),

  status: Joi.boolean(),

  range_start: Joi.number(),

  range_end: Joi.number().greater(Joi.ref("range_start")).messages({
    "number.greater": "range_end must be greater than range_start",
  }),
}).custom((value, helpers) => {
  const { condition_name, status, range_start, range_end } = value;

  // If condition_name invalid → stop here
  if (!validConditions.includes(condition_name)) {
    return helpers.error("any.only", { valids: validConditions });
  }

  if (condition_name !== "corner_block") {
    if (status !== undefined) {
      return helpers.message(
        "status is not allow when the condition name is land_fill, land_size, site_fall. ",
      );
    }
  }

  if (condition_name === "corner_block") {
    if (status === undefined) {
      return helpers.message(
        "status is required when condition_name is corner_block",
      );
    }
    if (range_start !== undefined || range_end !== undefined) {
      return helpers.message(
        "range_start and range_end are not allowed when condition_name is corner_block",
      );
    }
  } else if (range_start === undefined || range_end === undefined) {
    return helpers.message(
      "range_start and range_end are required for this condition",
    );
  }

  return value;
});

export const createPriceListItemSchema = Joi.object({
  conditions: Joi.array().items(conditionSchema).max(4).optional(),
  price_list_id: Joi.string().uuid().required().messages({
    "any.required": "price_list_id is required",
    "string.uuid": "price_list_id must be a valid UUID",
  }),

  item_description: Joi.string()
    .pattern(/^[^<>]*$/)
    .max(2000)
    .required()
    .messages({
      "any.required": "item_description is required",
    }),

  short_description: Joi.string().allow(null, "").max(255).optional(),

  cost_type: Joi.string()
    .valid("Included", "Fixed", "Variable")
    .required()
    .max(50)
    .messages({
      "any.required": "cost_type is required",
      "any.only": "cost_type must be one of: Included, Fixed, Variable",
    }),

  cost_type_text: Joi.string()
    .allow(null, "")
    .trim()
    .pattern(/^[^<>]*$/)
    .min(2)
    .max(255),

  cost_option: Joi.string().valid("none", "tba", "tbc").default("none").max(50),

  cost: Joi.number().precision(2).allow(null),

  builder_cost: Joi.number().precision(2).allow(null),

  // sort_order: Joi.number().integer().min(0).default(0).optional(),

  uom: Joi.string()
    .valid(...UOM_VALUES)
    .trim()
    .max(50)
    .required()
    .messages({
      "any.only": `uom must be one of: ${UOM_VALUES.join(", ")}`,
      "any.required": "uom is required",
      "string.empty": "uom is required",
    }),

  status: Joi.string()
    .valid("active", "inactive")
    .default("active")
    .trim()
    .max(20),

  include_by_default: Joi.boolean().default(false),

  allow_remove_from_quotation: Joi.boolean().default(false),

  show_in_hl_package: Joi.boolean().default(false),

  show_only_in_package: Joi.boolean().default(false),

  range_id: Joi.array().items(Joi.string().uuid()).required().messages({
    "array.includes": "Each range ID must be a valid UUID",
  }),

  dwelling_type_id: Joi.array().items(Joi.string().uuid()).required().messages({
    "array.includes": "Each dwelling type ID must be a valid UUID",
  }),

  additional_item: Joi.boolean().default(false).optional(),
});

export const getAllPriceListItemSchema = Joi.object({
  status: Joi.string().valid("active", "inactive").max(20).optional(),

  cost_option: Joi.string().valid("none", "tba", "tbc").max(50).optional(),

  price: Joi.number().precision(2).optional(),

  item_description: Joi.string().max(255).optional(),

  sort_order: Joi.number().integer().min(0).optional(),

  cost_type: Joi.string()
    .valid("Included", "Fixed", "Variable")
    .max(50)
    .optional(),

  uom: Joi.string()
    .valid(...UOM_VALUES)
    .allow(null, "")
    .trim()
    .max(50)
    .optional()
    .messages({
      "any.only": `uom must be one of: ${UOM_VALUES.join(", ")}`,
    }),

  price_list_id: Joi.string().uuid().optional().messages({
    "string.uuid": "price_list_id must be a valid UUID",
  }),

  range_id: Joi.string().uuid().optional().messages({
    "string.uuid": "range_id must be a valid UUID",
  }),

  dwelling_type_id: Joi.string().uuid().optional().messages({
    "string.uuid": "dwelling_type_id must be a valid UUID",
  }),

  is_system_data: Joi.boolean().optional().messages({
    "boolean.base": "is_system_data must be a boolean",
  }),

  location_id: Joi.string().uuid().optional().messages({
    "string.uuid": "location_id must be a valid UUID",
  }),

  package_id: Joi.string().uuid().optional().messages({
    "string.uuid": "package_id must be a valid UUID",
  }),

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
  search: Joi.string().allow(null, "").max(2000).optional(),
});

export const deletePriceListItemSchema = Joi.object({
  priceListItemId: Joi.string().uuid().required().messages({
    "string.guid": "Price list item ID must be a valid UUID",
    "any.required": "Price list item ID is required",
  }),
});

export const updatePriceListItemSParamschema = Joi.object({
  price_list_item_id: Joi.string().uuid().required().messages({
    "string.guid": "Price list item ID must be a valid UUID",
    "any.required": "Price list item ID is required",
  }),
});

export const updatePriceListItemSchema = Joi.object({
  item_description: Joi.string()
    .optional()
    .trim()
    .max(2000)
    .pattern(/^[^<>]*$/),

  short_description: Joi.string().allow(null, "").max(255).optional(),

  cost_type: Joi.string()
    .valid("Included", "Fixed", "Variable")
    .optional()
    .max(50)
    .messages({
      "any.only": "cost_type must be one of: Included, Fixed, Variable",
    }),

  cost_type_text: Joi.string().allow(null, "").trim().max(255).optional(),

  cost_option: Joi.string()
    .valid("none", "tba", "tbc")
    .max(50)
    .optional(),

  cost: Joi.number().precision(2).allow(null).optional(),

  builder_cost: Joi.number().precision(2).allow(null).optional(),

  sort_order: Joi.number().integer().min(0).optional(),

  // Partial update: uom may be omitted, but it can no longer be cleared —
  // null/"" are rejected so an existing item never loses its unit.
  uom: Joi.string()
    .valid(...UOM_VALUES)
    .trim()
    .max(50)
    .optional()
    .messages({
      "any.only": `uom must be one of: ${UOM_VALUES.join(", ")}`,
      "string.empty": "uom is required",
    }),

  status: Joi.string()
    .valid("active", "inactive")
    .trim()
    .max(20)
    .optional(),

  include_by_default: Joi.boolean(),

  allow_remove_from_quotation: Joi.boolean(),

  show_in_hl_package: Joi.boolean(),

  show_only_in_package: Joi.boolean(),

  range_id: Joi.array().items(Joi.string().uuid()).optional().messages({
    "array.includes": "Each range ID must be a valid UUID",
  }),

  dwelling_type_id: Joi.array().items(Joi.string().uuid()).optional().messages({
    "array.includes": "Each dwelling type ID must be a valid UUID",
  }),
  conditions: Joi.array().items(conditionSchema).max(4).optional(),
})

  .min(1)
  .messages({
    "object.min": "At least one field is required to update.",
  });

export const copyPriceListItemParamSchema = Joi.object({
  price_list_item_id: Joi.string().uuid().required().messages({
    "any.required": "price_list_item_id is required",
    "string.uuid": "price_list_item_id must be a valid UUID",
  }),
});

export const copyPriceListItemBodySchema = Joi.object({
  price_list_id: Joi.string().uuid().required().messages({
    "any.required": "price_list_id is required",
    "string.uuid": "price_list_id must be a valid UUID",
  }),
  item_description: Joi.string().required().max(2000).messages({
    "any.required": "item_description is required",
  }),
  // sort_order: Joi.number().integer().min(0).optional(),
});

export default {
  createPriceListItemSchema,
  getAllPriceListItemSchema,
  deletePriceListItemSchema,
  updatePriceListItemSParamschema,
  updatePriceListItemSchema,
  copyPriceListItemParamSchema,
  copyPriceListItemBodySchema,
};
