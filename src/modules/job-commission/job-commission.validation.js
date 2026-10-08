import Joi from "joi";
import { NAME_PATTERN, NAME_PATTERN_MESSAGE } from "../../utils/validationPatterns.js";

export const createJobCommissionSchema = Joi.object({
  commission_type: Joi.string().valid("outgoing", "incoming").required(),
  name: Joi.string()
    .min(2)
    .max(150)
    .required()
    .pattern(NAME_PATTERN),
  recipient: Joi.string()
    .max(100)
    .valid(
      "sales_person",
      "reporting_to",
      "referral_partner",
      "customer",
      "other_user",
    )
    .when("commission_type", {
      is: "outgoing",
      then: Joi.required().messages({
        "any.required": "recipient is required for outgoing commission.",
      }),
      otherwise: Joi.forbidden().messages({
        "any.unknown": "recipient cannot be defined for incoming commission.",
      }),
    }),
  recipient_user_id: Joi.alternatives().conditional("recipient", {
    is: "other_user",
    then: Joi.string().uuid().required().messages({
      "any.required":
        "recipient_user_id is required when recipient is 'other_user'.",
      "string.guid": "recipient_user_id must be a valid UUID.",
    }),

    otherwise: Joi.forbidden().messages({
      "any.unknown":
        "recipient_user_id is allowed only when recipient is 'other_user'.",
    }),
  }),
  commission_unit: Joi.string()
    .max(100)
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
  sort_order: Joi.number().integer().min(1).optional().messages({
    "number.base": "Sort order must be a number.",
    "number.min": "Sort order must be at least 1.",
  }),
});

export const getAllJobCommissionsSchema = Joi.object({
  commission_type: Joi.string().trim().max(50).valid("incoming", "outgoing"),
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

export const deleteJobCommissionSchema = Joi.object({
  job_commission_id: Joi.string().uuid().required().messages({
    "string.guid": "ID must be a valid UUID",
    "any.required": "ID is required",
  }),
});

export const updateJobCommissionParamsSchema = Joi.object({
  job_commission_id: Joi.string().uuid().required().messages({
    "string.guid": "Job commission ID must be a valid UUID",
    "any.required": "Job commission ID is required",
  }),
});

export const updateJobCommissionSchema = Joi.object({
  name: Joi.string()
    .min(2)
    .max(150)
    .pattern(NAME_PATTERN)
    .optional()
    .messages({
      "string.max": "Name cannot exceed 150 characters.",
    }),

  recipient: Joi.string()
    .max(100)
    .valid(
      "sales_person",
      "reporting_to",
      "referral_partner",
      "customer",
      "other_user",
    )
    .optional()
    .messages({
      "any.only":
        "Recipient must be one of 'sales_person', 'reporting_to', 'referral_partner', 'customer', or 'other_user'.",
    }),

  recipient_user_id: Joi.string()
    .uuid()
    .optional()
    .when("recipient", {
      is: "other_user",
      then: Joi.optional().messages({
        "any.required":
          "Recipient user ID is required when recipient is 'other_user'.",
      }),
    }),

  commission_unit: Joi.string()
    .max(100)
    .valid("percentage", "amount")
    .optional()
    .messages({
      "any.only": "Commission unit must be 'percentage' or 'amount'.",
    }),

  commission_value: Joi.number().min(0).optional(),

  sort_order: Joi.number().integer().min(0).optional().messages({
    "number.base": "Sort order must be an integer.",
    "number.min": "Sort order cannot be negative.",
  }),
});

export default {
  createJobCommissionSchema,
  getAllJobCommissionsSchema,
  deleteJobCommissionSchema,
  updateJobCommissionParamsSchema,
  updateJobCommissionSchema,
};
