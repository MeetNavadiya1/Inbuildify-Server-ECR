import Joi from "joi";
import { NAME_PATTERN, NAME_PATTERN_MESSAGE } from "../../utils/validationPatterns.js";

export const createContractFormatSchema = Joi.object({
  format_name: Joi.string()
    .min(2)
    .max(255)
    .required()
    .pattern(NAME_PATTERN)
    .messages({
      "string.empty": "format_name cannot be empty.",
      "string.max": "format_name cannot exceed 255 characters.",
      "any.required": "format_name is required.",
    }),
  default_format: Joi.boolean().optional().messages({
    "boolean.base": "default_format must be a boolean.",
  }),
  status: Joi.boolean().optional().messages({
    "boolean.base": "status must be a boolean.",
  }),
  builder: Joi.string().uuid().required().messages({
    "string.guid": "builder must be a valid UUID.",
  }),
});

export const getAllContractFormatsSchema = Joi.object({
  page: Joi.number().integer().min(1).optional().default(1).messages({
    "number.base": "page must be a number.",
    "number.integer": "page must be an integer.",
    "number.min": "page must be at least 1.",
  }),
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .optional()
    .default(25)
    .messages({
      "number.base": "limit must be a number.",
      "number.integer": "limit must be an integer.",
      "number.min": "limit must be at least 1.",
      "number.max": "limit cannot exceed 100.",
    }),
  format_name: Joi.string().max(255).optional().messages({
    "string.base": "format_name must be a string.",
  }),
  status: Joi.string().valid("true", "false").optional().messages({
    "any.only": "status must be either 'true' or 'false'.",
  }),
  default_format: Joi.string().valid("true", "false").optional().messages({
    "any.only": "default_format must be either 'true' or 'false'.",
  }),
  builder: Joi.string().uuid().optional().messages({
    "string.guid": "builder must be a valid UUID.",
  }),
  created_at: Joi.string()
    .valid("last_7_days", "last_15_days", "last_30_days")
    .optional()
    .messages({
      "any.only":
        "created_at must be either 'last_7_days', 'last_15_days', or 'last_30_days'.",
    }),
  updated_at: Joi.string()
    .valid("last_7_days", "last_15_days", "last_30_days")
    .optional()
    .messages({
      "any.only":
        "updated_at must be either 'last_7_days', 'last_15_days', or 'last_30_days'.",
    }),
  start_date: Joi.date().iso().optional().messages({
    "date.format":
      "start_date must be a valid date in ISO format (YYYY-MM-DD).",
  }),
  end_date: Joi.date().iso().optional().messages({
    "date.format": "end_date must be a valid date in ISO format (YYYY-MM-DD).",
  }),
  start_updated_date: Joi.date().iso().optional().messages({
    "date.format":
      "start_updated_date must be a valid date in ISO format (YYYY-MM-DD).",
  }),
  end_updated_date: Joi.date().iso().optional().messages({
    "date.format":
      "end_updated_date must be a valid date in ISO format (YYYY-MM-DD).",
  }),
});

export const getContractFormatByIdSchema = Joi.object({
  contract_format_id: Joi.string().uuid().required().messages({
    "string.guid": "contract_format_id must be a valid UUID.",
    "any.required": "contract_format_id is required.",
  }),
});

export const updateContractFormatParamsSchema = Joi.object({
  contract_format_id: Joi.string().uuid().required().messages({
    "string.guid": "contract_format_id must be a valid UUID.",
    "any.required": "contract_format_id is required.",
  }),
});

export const updateContractFormatSchema = Joi.object({
  format_name: Joi.string()
    .min(2)
    .max(255)
    .pattern(NAME_PATTERN)
    .optional()
    .messages({
      "string.empty": "format_name cannot be empty.",
      "string.max": "format_name cannot exceed 255 characters.",
    }),
  default_format: Joi.boolean().optional().messages({
    "boolean.base": "default_format must be a boolean.",
  }),
  status: Joi.boolean().optional().messages({
    "boolean.base": "status must be a boolean.",
  }),
  builder: Joi.string().uuid().optional().allow(null).messages({
    "string.guid": "builder must be a valid UUID.",
  }),
})
  .min(1)
  .messages({
    "object.min": "At least one field must be provided for update.",
  });

export const deleteContractFormatSchema = Joi.object({
  contract_format_id: Joi.string().uuid().required().messages({
    "string.guid": "contract_format_id must be a valid UUID.",
    "any.required": "contract_format_id is required.",
  }),
});

export default {
  createContractFormatSchema,
  getAllContractFormatsSchema,
  getContractFormatByIdSchema,
  updateContractFormatParamsSchema,
  updateContractFormatSchema,
  deleteContractFormatSchema,
};
