import Joi from "joi";

/**
 * A builder configures one schedule per payment method, and the building
 * contract's Payment Method radio picks which one its stages are loaded from.
 */
const METHODS = ["method1", "method2"];

const methodField = Joi.string()
  .trim()
  .valid(...METHODS)
  .messages({ "any.only": `Method must be one of ${METHODS.join(", ")}` });

export const createJobInvoiceStagePaymentSchema = Joi.object({
  // Defaulted rather than required, so a caller that predates methods still
  // writes into Method 1 — where its existing stages already are.
  method: methodField.default("method1"),

  description: Joi.string()
    .trim()
    .min(2)
    .max(150)
    .required()
    .pattern(/^(?=.*[a-zA-Z])[a-zA-Z0-9\s,./#-]+$/)
    .messages({
      "string.base": "Description must be a string.",
      "string.empty": "Description is required.",
      "string.max": "Description cannot exceed 150 characters.",
      "any.required": "Description is required.",
    }),

  percentage: Joi.number()
    .min(0.0)
    .max(100.0)
    .precision(2)
    .optional()
    .messages({
      "number.base": "Percentage must be a number.",
      "number.min": "Percentage cannot be less than 0.",
      "number.max": "Percentage cannot be greater than 100.",
    }),

  sort_order: Joi.number().integer().min(1).optional().messages({
    "number.base": "Sort order must be a number.",
    "number.min": "Sort order must be at least 1.",
  }),
});

export const getAllJobInvoiceStagePaymentSchema = Joi.object({
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

  // Omit to list both schedules.
  method: methodField.optional(),
});

export const deleteJobInvoiceStagePaymentSchema = Joi.object({
  id: Joi.string().uuid().required().messages({
    "string.guid": "job invoice stage payment ID must be a valid UUID",
    "any.required": "job invoice stage payment ID is required",
  }),
});

export const updateJobInvoiceStagePaymentParamsSchema = Joi.object({
  job_invoice_stage_payment_id: Joi.string().uuid().required().messages({
    "string.guid": "job invoice stage payment ID must be a valid UUID",
    "any.required": "job invoice stage payment ID is required",
  }),
});

export const updateJobInvoiceStagePaymentSchema = Joi.object({
  description: Joi.string()
    .trim()
    .min(2)
    .max(150)
    .pattern(/^(?=.*[a-zA-Z])[a-zA-Z0-9\s,./#-]+$/)
    .optional()
    .messages({
      "string.base": "Description must be a string.",
      "string.max": "Description cannot exceed 150 characters.",
    }),

  percentage: Joi.number()
    .min(0.0)
    .max(100.0)
    .precision(2)
    .optional()
    .messages({
      "number.base": "Percentage must be a number.",
      "number.min": "Percentage cannot be less than 0.",
      "number.max": "Percentage cannot be greater than 100.",
    }),

  sort_order: Joi.number().integer().min(1).optional().messages({
    "number.base": "Sort order must be a number.",
    "number.min": "Sort order must be at least 1.",
  }),

  // Accepted so an unchanged value round-trips; the service rejects a change,
  // since moving a stage between schedules would renumber both.
  method: methodField.optional(),
});

export default {
  createJobInvoiceStagePaymentSchema,
  getAllJobInvoiceStagePaymentSchema,
  deleteJobInvoiceStagePaymentSchema,
  updateJobInvoiceStagePaymentParamsSchema,
  updateJobInvoiceStagePaymentSchema,
};
