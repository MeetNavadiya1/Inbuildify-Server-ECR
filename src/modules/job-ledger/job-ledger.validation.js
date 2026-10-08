import Joi from "joi";

const category = Joi.string().max(50).optional().allow(null, "");

export const createJobLedgerEntrySchema = Joi.object({
  job_id: Joi.string().uuid().required().messages({
    "string.guid": "job_id must be a valid UUID",
    "any.required": "job_id is required",
  }),
  ledger: Joi.string().valid("customer", "expense").optional().default("customer"),
  entry_type: Joi.string().valid("debit", "credit").required().messages({
    "any.required": "entry_type is required",
    "any.only": "entry_type must be either debit or credit",
  }),
  category,
  description: Joi.string().max(255).required().messages({
    "any.required": "description is required",
  }),
  amount: Joi.number().precision(2).positive().required().messages({
    "any.required": "amount is required",
    "number.positive": "amount must be a positive number",
  }),
  entry_date: Joi.date().required().messages({ "any.required": "entry_date is required" }),
  payment_method: Joi.string().max(50).optional().allow(null, ""),
  reference_number: Joi.string().max(50).optional().allow(null, ""),
  is_personal: Joi.boolean().optional().default(false),
  notes: Joi.string().max(500).optional().allow(null, ""),
});

export const updateJobLedgerEntrySchema = Joi.object({
  ledger: Joi.string().valid("customer", "expense").optional(),
  entry_type: Joi.string().valid("debit", "credit").optional(),
  category,
  description: Joi.string().max(255).optional(),
  amount: Joi.number().precision(2).positive().optional(),
  entry_date: Joi.date().optional(),
  payment_method: Joi.string().max(50).optional().allow(null, ""),
  reference_number: Joi.string().max(50).optional().allow(null, ""),
  is_personal: Joi.boolean().optional(),
  notes: Joi.string().max(500).optional().allow(null, ""),
})
  .min(1)
  .messages({ "object.min": "At least one field must be provided for update" });

export const jobLedgerEntryParamsSchema = Joi.object({
  job_ledger_entry_id: Joi.string().uuid().required().messages({
    "string.guid": "job_ledger_entry_id must be a valid UUID",
    "any.required": "job_ledger_entry_id is required",
  }),
});

export const jobIdParamsSchema = Joi.object({
  job_id: Joi.string().uuid().required().messages({
    "string.guid": "job_id must be a valid UUID",
    "any.required": "job_id is required",
  }),
});
