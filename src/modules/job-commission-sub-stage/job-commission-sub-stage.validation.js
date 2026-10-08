import Joi from "joi";
import { NAME_PATTERN, NAME_PATTERN_MESSAGE } from "../../utils/validationPatterns.js";

export const createJobCommissionSubStageSchema = Joi.object({
  job_commission_id: Joi.string().uuid().required().messages({
    "any.required": "job_commission_id is required",
    "string.guid": "job_commission_id must be a valid UUID",
  }),

  name: Joi.string()
    .trim()
    .min(2)
    .max(150)
    .required()
    .pattern(NAME_PATTERN)
    .messages({
      "any.required": "name is required",
      "string.empty": "name cannot be empty",
      "string.max": "name cannot exceed 150 characters",
    }),

  commission_unit: Joi.string()
    .max(50)
    .valid("percentage", "amount")
    .required(),
  commission_value: Joi.alternatives()
    .conditional("commission_unit", {
      is: "percentage",
      then: Joi.number().min(0).max(100).precision(2).required().messages({
        "number.max": "Percentage cannot be more than 100.",
        "number.precision":
          "Percentage must have maximum 2 decimal places (precision 5,2).",
      }),
    })
    .conditional("commission_unit", {
      is: "amount",
      then: Joi.number()
        .min(0)
        .max(99999999.99)
        .precision(2)
        .required()
        .messages({
          "number.max": "Amount cannot exceed 99999999.99 (precision 10,2).",
          "number.precision":
            "Amount must have maximum 2 decimal places (precision 10,2).",
        }),
    })
    .required(),
  sort_order: Joi.number().integer().min(0).default(0).optional().messages({
    "number.base": "sort_order must be a number",
    "number.integer": "sort_order must be an integer",
    "number.min": "sort_order cannot be negative",
  }),
});

export const getAllJobCommissionSubStageSchema = Joi.object({
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
});

export const getJobCommissionSubStagesByCommissionIdSchema = Joi.object({
  job_commission_id: Joi.string().uuid().required().messages({
    "string.guid": "Job commission id must be a valid UUID",
    "any.required": "Job commission id is required",
  }),
});

export const getJobCommissionSubStagesByCommissionSchema = Joi.object({
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
});

export const deleteJobCommissionSubStageSchema = Joi.object({
  id: Joi.string().uuid().required().messages({
    "string.guid": "Job commission id must be a valid UUID",
    "any.required": "Job commission id is required",
  }),
});

export const updateJobCommissionSubStageParamsSchema = Joi.object({
  job_commission_sub_stage_id: Joi.string().uuid().required().messages({
    "string.guid": "Job commission id must be a valid UUID",
    "any.required": "Job commission id is required",
  }),
});

export const updateJobCommissionSubStageSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(2)
    .max(150)
    .pattern(NAME_PATTERN)
    .optional()
    .messages({
      "string.empty": "name cannot be empty",
      "string.max": "name cannot exceed 150 characters",
    }),

  commission_unit: Joi.string()
    .min(50)
    .valid("percentage", "amount")
    .optional()
    .messages({
      "any.only": "commission_unit must be either percentage or amount.",
    }),

  commission_value: Joi.number().precision(2).min(0).optional().messages({
    "number.base": "commission_value must be a number",
    "number.min": "commission_value must be greater than or equal to 0",
  }),

  sort_order: Joi.number().integer().min(0).default(0).optional().messages({
    "number.base": "sort_order must be a number",
    "number.integer": "sort_order must be an integer",
    "number.min": "sort_order cannot be negative",
  }),
});

export default {
  createJobCommissionSubStageSchema,
  getAllJobCommissionSubStageSchema,
  getJobCommissionSubStagesByCommissionIdSchema,
  getJobCommissionSubStagesByCommissionSchema,
  deleteJobCommissionSubStageSchema,
  updateJobCommissionSubStageParamsSchema,
  updateJobCommissionSubStageSchema,
};
