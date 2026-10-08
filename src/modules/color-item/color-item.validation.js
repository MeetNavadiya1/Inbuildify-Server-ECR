import Joi from "joi";
import { NAME_PATTERN, NAME_PATTERN_MESSAGE } from "../../utils/validationPatterns.js";

export const getAllColorItemsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1).messages({
    "number.base": "Page must be a number",
    "number.integer": "Page must be an integer",
    "number.min": "Page must be greater than 0",
  }),

  limit: Joi.number().integer().min(1).max(100).default(25).messages({
    "number.base": "Limit must be a number",
    "number.integer": "Limit must be an integer",
    "number.min": "Limit must be at least 1",
    "number.max": "Limit must not exceed 100",
  }),

  status: Joi.boolean().optional().messages({
    "any.only": "Status must be either 'true' or 'false'",
  }),

  search: Joi.string().trim().max(255).allow("").optional().messages({
    "string.max": "Search term must not exceed 255 characters",
  }),

  color_group_id: Joi.string().uuid().optional().messages({
    "string.uuid": "color group ID must be a valid UUID",
    "string.guid": "color group ID must be a valid UUID",
  }),

  color_category_id: Joi.string().uuid().optional().allow(null).messages({
    "string.uuid": "color category ID must be a valid UUID",
    "string.guid": "color category ID must be a valid UUID",
  }),

  cost_type: Joi.string()
    .max(50)
    .valid("standard", "upgrade")
    .optional()
    .messages({
      "any.only": "Cost type must be either 'standard' or 'upgrade'",
    }),

  upgrade_option: Joi.string()
    .max(50)
    .valid("fixed", "start_from", "tba")
    .optional()
    .messages({
      "any.only": "Upgrade option must be one of: fixed, start_from, tba",
    }),

  units: Joi.string()
    .max(50)
    .valid("mandatory", "non_mandatory", "not_required")
    .optional()
    .messages({
      "any.only":
        "Units must be one of: mandatory, non_mandatory, not_required",
    }),

  job_id: Joi.string().uuid().optional().allow(null, "").messages({
    "string.uuid": "Job ID must be a valid UUID",
    "string.guid": "Job ID must be a valid UUID",
  }),
});

export const getColorItemByIdSchema = Joi.object({
  color_item_id: Joi.string().uuid().required().messages({
    "any.required": "Color item ID is required",
    "string.uuid": "Color item ID must be a valid UUID",
    "string.guid": "Color item ID must be a valid UUID",
  }),
});
export const createColorItemSchema = Joi.object({
  default_image_index: Joi.number().integer().optional(),
  item_name: Joi.string()
    .trim()
    .min(2)
    .max(255)
    .pattern(NAME_PATTERN)
    .required()
    .messages({
      "any.required": "Item name is required",
      "string.empty": "Item name cannot be empty",
      "string.max": "Item name must not exceed 255 characters",
    }),
  color_group_id: Joi.string().uuid().optional().allow(null).messages({
    "string.uuid": "color group ID must be a valid UUID",
    "string.guid": "color group ID must be a valid UUID",
  }),
  color_category_id: Joi.string().uuid().optional().allow(null).messages({
    "string.uuid": "color category ID must be a valid UUID",
    "string.guid": "color category ID must be a valid UUID",
  }),

  item_code: Joi.string().trim().min(5).max(100).required().messages({
    "any.required": "Item code is required",
    "string.empty": "Item code cannot be empty",
    "string.min": "Item code must be at least 5 characters",
    "string.max": "Item code must not exceed 100 characters",
  }),

  supplier_id: Joi.string().uuid().optional().allow(null).messages({
    "string.uuid": "Supplier ID must be a valid UUID",
    "string.guid": "Supplier ID must be a valid UUID",
  }),

  upgrade_option: Joi.string()
    .max(50)
    .valid("fixed", "start_from", "tba")
    .optional()
    .allow(null)
    .messages({
      "any.only": "Upgrade option must be one of: fixed, start_from, tba",
    }),

  cost_type: Joi.string()
    .max(50)
    .valid("standard", "upgrade")
    .default("standard")
    .messages({
      "any.only": "Cost type must be either 'standard' or 'upgrade'",
    }),

  cost: Joi.alternatives().try(
    Joi.number().min(0).precision(2).messages({
      "number.base": "Cost must be a number",
      "number.min": "Cost must be greater than or equal to 0",
      "number.precision": "Cost can have maximum 2 decimal places",
    }),
    Joi.string().valid("", "null", "undefined").empty(Joi.any().valid("", "null", "undefined")).default(null),
  ).optional().allow(null),

  color_type_id: Joi.array().optional().allow(null).messages({
    "array.base": "Color type ID must be an array",
    "array.empty": "Color type ID cannot be empty",
    "array.includes": "Color type ID must be a valid UUID",
  }),
  color_id: Joi.string().uuid().optional().allow(null).messages({
    "string.uuid": "color ID must be a valid UUID",
    "string.guid": "color ID must be a valid UUID",
  }),
  range_id: Joi.array().optional().allow(null).messages({
    "array.base": "Range ID must be an array",
    "array.empty": "Range ID cannot be empty",
    "array.includes": "Range ID must be a valid UUID",
  }),

  features: Joi.string()
    .trim()
    .max(500)
    .allow("")
    .pattern(/^[^<>]*$/)
    .required()
    .messages({
      "string.max": "Features must not exceed 500 characters",
    }),

  description: Joi.string()
    .trim()
    .max(500)
    .allow("")
    .pattern(/^[^<>]*$/)
    .required()
    .messages({
      "string.max": "Description must not exceed 500 characters",
    }),

  specification_name: Joi.string()
    .trim()
    .max(500)
    .allow("")
    .pattern(/^[^<>]*$/)
    .optional()
    .messages({
      "string.max": "specification name must not exceed 500 characters",
    }),

  units: Joi.string()
    .max(50)
    .valid("mandatory", "non_mandatory", "not_required")
    .default("non_mandatory")
    .messages({
      "any.only":
        "Units must be one of: mandatory, non_mandatory, not_required",
    }),

  color_image: Joi.alternatives()
    .try(Joi.string().allow("", null), Joi.array(), Joi.object())
    .optional()
    .allow(null),

  specification: Joi.alternatives()
    .try(Joi.string().allow("", null), Joi.array(), Joi.object())
    .optional()
    .allow(null),

  status: Joi.boolean().default(true).messages({
    "boolean.base": "Status must be true or false",
  }),

  sort_order: Joi.number().integer().optional().allow(null).messages({
    "number.base": "Sort order must be a number",
    "number.integer": "Sort order must be an integer",
  }),

  custom_fields: Joi.alternatives()
    .try(
      Joi.array().items(
        Joi.object({
          field_name: Joi.string().trim().required().messages({
            "any.required": "Field name is required",
            "string.empty": "Field name cannot be empty",
          }),
          field_type: Joi.string().trim().valid("text", "checkbox", "dropdown_list", "radio_button").required().messages({
            "any.required": "Field type is required",
            "string.empty": "Field type cannot be empty",
          }),
          required_field: Joi.boolean().default(false),
          sort_order: Joi.number().integer().min(1).optional().messages({
            "number.base": "Sort order must be a number",
            "number.integer": "Sort order must be an integer",
            "number.min": "Sort order must be at least 1",
          }),
        }),
      ),
      Joi.object().unknown(true),
      Joi.string(),
    )
    .optional()
    .allow(null)
    .messages({
      "alternatives.types": "Custom fields must be an array, object, or JSON string",
    }),
});

export const updateColorItemSchema = Joi.object({
  default_image_index: Joi.number().integer().optional(),

  item_name: Joi.string()
    .trim()
    .min(2)
    .max(255)
    .pattern(NAME_PATTERN)
    .optional()
    .messages({
      "string.empty": "Item name cannot be empty",
      "string.max": "Item name must not exceed 255 characters",
    }),

  item_code: Joi.string().trim().min(5).max(100).optional().messages({
    "string.empty": "Item code cannot be empty",
    "string.min": "Item code must be at least 5 characters",
    "string.max": "Item code must not exceed 100 characters",
  }),

  supplier_id: Joi.string().uuid().optional().allow(null).messages({
    "string.uuid": "Supplier ID must be a valid UUID",
    "string.guid": "Supplier ID must be a valid UUID",
  }),

  upgrade_option: Joi.string()
    .max(50)
    .valid("fixed", "start_from", "tba")
    .optional()
    .allow(null)
    .messages({
      "any.only": "Upgrade option must be one of: fixed, start_from, tba",
    }),

  cost_type: Joi.string()
    .max(50)
    .valid("standard", "upgrade")
    .optional()
    .messages({
      "any.only": "Cost type must be either 'standard' or 'upgrade'",
    }),

  cost: Joi.alternatives().try(
    Joi.number().min(0).precision(2).messages({
      "number.base": "Cost must be a number",
      "number.min": "Cost must be greater than or equal to 0",
      "number.precision": "Cost can have maximum 2 decimal places",
    }),
    Joi.string().valid("", "null", "undefined").empty(Joi.any().valid("", "null", "undefined")).default(null),
  ).optional().allow(null),

  features: Joi.string()
    .trim()
    .max(500)
    .allow("")
    .pattern(/^[^<>]*$/)
    .messages({
      "string.max": "Features must not exceed 500 characters",
    }),

  description: Joi.string()
    .trim()
    .max(500)
    .allow("")
    .pattern(/^[^<>]*$/)
    .messages({
      "string.max": "Description must not exceed 500 characters",
    }),

  specification_name: Joi.string()
    .trim()
    .max(500)
    .allow("")
    .pattern(/^[^<>]*$/)
    .optional()
    .messages({
      "string.max": "specification name must not exceed 500 characters",
    }),

  units: Joi.string()
    .max(50)
    .valid("mandatory", "non_mandatory", "not_required")
    .optional()
    .messages({
      "any.only":
        "Units must be one of: mandatory, non_mandatory, not_required",
    }),

  color_image: Joi.string().trim().max(500).allow("", null).optional().messages({
    "string.max": "Color image must not exceed 500 characters",
  }),

  specification: Joi.string().trim().max(500).allow("", null).optional().messages({
    "string.max": "Specification must not exceed 500 characters",
  }),

  // color_image: Joi.array()
  //   .items(Joi.string().uri())
  //   .optional()
  //   .allow(null)
  //   .messages({
  //     "array.base": "Color image must be an array",
  //     "array.includes": "Color image must be a valid URL",
  //   }),

  // specification: Joi.array()
  //   .items(Joi.string().uri())
  //   .optional()
  //   .allow(null)
  //   .messages({
  //     "array.base": "Specification must be an array",
  //     "array.includes": "Specification must be a valid URL",
  //   }),

  range_id: Joi.array().optional().allow(null).messages({
    "array.base": "Range ID must be an array",
    "array.empty": "Range ID cannot be empty",
    "array.includes": "Range ID must be a valid UUID",
  }),

  color_type_id: Joi.array().optional().allow(null).messages({
    "array.base": "Color type ID must be an array",
    "array.empty": "Color type ID cannot be empty",
    "array.includes": "Color type ID must be a valid UUID",
  }),

  status: Joi.boolean().optional().messages({
    "boolean.base": "Status must be true or false",
  }),

  sort_order: Joi.number().integer().optional().allow(null).messages({
    "number.base": "Sort order must be a number",
    "number.integer": "Sort order must be an integer",
  }),
})
  .min(1)
  .message({ "object.min": "At least one field is required to update" });

export const deleteColorItemSchema = Joi.object({
  color_item_id: Joi.string().uuid().required().messages({
    "any.required": "Color item ID is required",
    "string.uuid": "Color item ID must be a valid UUID",
    "string.guid": "Color item ID must be a valid UUID",
  }),
});

export const deleteImageFieldSchema = Joi.object({
  field_name: Joi.string()
    .max(255)
    .valid("color_image", "specification")
    .required()
    .messages({
      "any.required": "Field name is required",
      "any.only": "Field name must be either 'color_image' or 'specification'",
    }),

  index: Joi.number().integer().optional(),
});

export const colorItemMoveSchema = Joi.object({
  color_id: Joi.string().uuid().required().messages({
    "any.required": "Color ID is required",
    "string.uuid": "Color ID must be a valid UUID",
    "string.guid": "Color ID must be a valid UUID",
  }),

  color_category_id: Joi.string().uuid().required().messages({
    "any.required": "Color category ID is required",
    "string.uuid": "Color category ID must be a valid UUID",
    "string.guid": "Color categroy ID must be a valid UUID",
  }),
});

export const copyColorItemSchema = Joi.object({
  color_id: Joi.string().uuid().required().messages({
    "any.required": "Color ID is required",
    "string.uuid": "Color ID must be a valid UUID",
    "string.guid": "Color ID must be a valid UUID",
  }),

  color_category_id: Joi.string().uuid().required().messages({
    "any.required": "Color category ID is required",
    "string.uuid": "Color category ID must be a valid UUID",
    "string.guid": "Color category ID must be a valid UUID",
  }),

  item_name: Joi.string().trim().min(1).max(255).required().messages({
    "any.required": "Item name is required",
    "string.empty": "Item name cannot be empty",
    "string.min": "Item name must be at least 1 character long",
    "string.max": "Item name must not exceed 255 characters",
  }),

  sort_order: Joi.number().integer().min(1).optional().messages({
    "number.base": "Sort order must be a number",
    "number.integer": "Sort order must be an integer",
    "number.min": "Sort order must be at least 1",
  }),
});

export const getColorItemsWithoutCategorySchema = Joi.object({
  color_group_id: Joi.string().uuid().optional().messages({
    "string.uuid": "color group ID must be a valid UUID",
    "string.guid": "color group ID must be a valid UUID",
  }),
});

export const sendColorEmailSchema = Joi.object({
  item_ids: Joi.array().items(Joi.string().uuid()).required().messages({
    "any.required": "Item IDs are required",
    "array.base": "Item IDs must be an array of UUIDs",
  }),
  job_info: Joi.object({
    job_id: Joi.string().uuid().optional().allow("", null),
    job_address: Joi.string().allow(""),
    customer_name: Joi.string().allow(""),
    reference_number: Joi.string().allow(""),
    total_amount: Joi.string().allow(""),
  }).optional(),
  show_image: Joi.boolean().optional(),
  show_price: Joi.boolean().optional(),
  email_data: Joi.object({
    to: Joi.array().items(Joi.string().email()).min(1).required().messages({
      "any.required": "Recipient email(s) are required",
      "array.min": "At least one recipient is required",
    }),
    cc: Joi.array().items(Joi.string().email()).optional(),
    subject: Joi.string().required().messages({
      "any.required": "Subject is required",
    }),
    message: Joi.string().allow("").required().messages({
      "any.required": "Message is required",
    }),
  }).required().messages({
    "any.required": "Email data is required",
  }),
});

export default {
  getAllColorItemsSchema,
  getColorItemsWithoutCategorySchema,
  getColorItemByIdSchema,
  createColorItemSchema,
  updateColorItemSchema,
  deleteColorItemSchema,
  deleteImageFieldSchema,
  colorItemMoveSchema,
  copyColorItemSchema,
  sendColorEmailSchema,
};
