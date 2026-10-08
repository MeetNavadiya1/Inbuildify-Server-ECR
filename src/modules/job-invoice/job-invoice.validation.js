import Joi from "joi";

// ─── Invoice ──────────────────────────────────────────────────────────────────

export const createJobInvoiceSchema = Joi.object({
  job_id: Joi.string().uuid().required().messages({
    "string.guid": "job_id must be a valid UUID",
    "any.required": "job_id is required",
  }),
  description: Joi.string().max(500).required().messages({
    "any.required": "description is required",
    "string.max": "description must not exceed 500 characters",
  }),
  notes: Joi.string().max(500).optional().allow(null, ""),
  invoice_date: Joi.date().optional().allow(null),
  due_date: Joi.date().optional().allow(null),
  invoice_amount: Joi.number().precision(2).positive().optional().allow(null),
  amount_type: Joi.string().valid("contract_cost", "total_cost").optional().default("contract_cost"),
});

export const updateJobInvoiceSchema = Joi.object({
  description: Joi.string().max(500).optional(),
  notes: Joi.string().max(500).optional().allow(null, ""),
  invoice_date: Joi.date().optional().allow(null),
  due_date: Joi.date().optional().allow(null),
  invoice_amount: Joi.number().precision(2).positive().optional().allow(null),
  amount_type: Joi.string().valid("contract_cost", "total_cost").optional(),
  status: Joi.string().valid("draft", "sent", "paid", "overdue", "unsent").optional(),
}).min(1).messages({ "object.min": "At least one field must be provided for update" });

export const jobInvoiceParamsSchema = Joi.object({
  job_invoice_id: Joi.string().uuid().required().messages({
    "string.guid": "job_invoice_id must be a valid UUID",
    "any.required": "job_invoice_id is required",
  }),
});

export const jobIdParamsSchema = Joi.object({
  job_id: Joi.string().uuid().required().messages({
    "string.guid": "job_id must be a valid UUID",
    "any.required": "job_id is required",
  }),
});

// ─── Send Invoice Email ───────────────────────────────────────────────────────

export const sendJobInvoiceEmailSchema = Joi.object({
  to: Joi.array().items(Joi.string().email()).min(1).single().required().messages({
    "any.required": "At least one recipient email is required",
  }),
  subject: Joi.string().max(500).required(),
  content: Joi.string().required(),
  attach_pdf: Joi.boolean().optional().default(true),
  pdf: Joi.string().allow(null, "").optional(),
});

// ─── Payment ──────────────────────────────────────────────────────────────────

export const createJobInvoicePaymentSchema = Joi.object({
  payment_date: Joi.date().required().messages({
    "any.required": "payment_date is required",
  }),
  payment_method: Joi.string()
    .valid("cash", "bank", "cheque", "card", "EFTPOS", "personal_online_transfer", "loan_online_transfer")
    .required()
    .messages({ "any.required": "payment_method is required" }),
  transaction_no: Joi.string().max(50).optional().allow(null, ""),
  amount: Joi.number().precision(2).positive().required().messages({
    "any.required": "amount is required",
    "number.positive": "amount must be a positive number",
  }),
  notes: Joi.string().max(500).optional().allow(null, ""),
});

export const updateJobInvoicePaymentSchema = Joi.object({
  payment_date: Joi.date().optional(),
  payment_method: Joi.string()
    .valid("cash", "bank", "cheque", "card", "EFTPOS", "personal_online_transfer", "loan_online_transfer")
    .optional(),
  transaction_no: Joi.string().max(50).optional().allow(null, ""),
  amount: Joi.number().precision(2).positive().optional(),
  notes: Joi.string().max(500).optional().allow(null, ""),
}).min(1).messages({ "object.min": "At least one field must be provided for update" });

export const jobInvoicePaymentParamsSchema = Joi.object({
  job_invoice_id: Joi.string().uuid().required(),
  payment_id: Joi.string().uuid().required(),
});

// ─── Send Receipt Email ───────────────────────────────────────────────────────

export const sendJobInvoiceReceiptSchema = Joi.object({
  to: Joi.array().items(Joi.string().email()).min(1).single().required(),
  subject: Joi.string().max(500).required(),
  content: Joi.string().required(),
  payment_ids: Joi.array().items(Joi.string().uuid()).min(1).single().required().messages({
    "any.required": "payment_ids is required",
    "array.min": "At least one payment must be selected for the receipt",
  }),
  attach_pdf: Joi.boolean().optional().default(true),
  pdf: Joi.string().allow(null, "").optional(),
});

// ─── Contract Dates ───────────────────────────────────────────────────────────

export const contractDatesParamsSchema = Joi.object({
  job_id: Joi.string().uuid().required(),
});

export const contractDatesBodySchema = Joi.object({
  contract_prepared_date: Joi.date().optional().allow(null),
  contract_signed_date: Joi.date().optional().allow(null),
}).min(1).messages({ "object.min": "At least one date field must be provided" });
