import Joi from "joi";

export const createInvoiceSchema = Joi.object({
  leads_id: Joi.string().uuid().required().messages({
    "string.guid": "Lead ID must be a valid UUID",
    "any.required": "Lead ID is required",
  }),
  generate_invoice: Joi.boolean().optional().default(false),
  status: Joi.forbidden().messages({
    "any.unknown": "Status cannot be manually provided. It is strictly determined by the invoice/deposit type.",
  }),
  description: Joi.string().max(500).required().messages({
    "string.max": "Description must not exceed 500 characters",
    "any.required": "Description is required",
  }),

  invoice_date: Joi.date().optional(),
  due_date: Joi.date().min(Joi.ref("invoice_date")).optional().messages({
    "date.min": "due_date must be greater than or equal to invoice_date",
  }),
  invoice_amount: Joi.number().precision(2).optional(),

  deposite_date: Joi.date().optional(),
  deposite_amount: Joi.number().precision(2).optional(),
  payment_method: Joi.string()
    .valid("cash", "cheque", "personal_online_transfer", "loan_online_transfer", "EFTPOS")
    .optional(),
  transaction_no: Joi.string().max(20).optional().allow(null, ""),
})
  .when(Joi.object({ generate_invoice: Joi.valid(true) }).unknown(), {
    then: Joi.object({
      invoice_date: Joi.required().messages({ "any.required": "invoice_date is required when generate_invoice is true" }),
      due_date: Joi.required().messages({ "any.required": "due_date is required when generate_invoice is true" }),
      invoice_amount: Joi.required().messages({ "any.required": "invoice_amount is required when generate_invoice is true" }),
      deposite_date: Joi.forbidden(),
      deposite_amount: Joi.forbidden(),
      payment_method: Joi.forbidden(),
      transaction_no: Joi.forbidden(),
    }),
  })
  .when(Joi.object({ generate_invoice: Joi.valid(false) }).unknown(), {
    then: Joi.object({
      deposite_date: Joi.required().messages({ "any.required": "deposite_date is required when generate_invoice is false" }),
      deposite_amount: Joi.required().messages({ "any.required": "deposite_amount is required when generate_invoice is false" }),
      payment_method: Joi.required().messages({ "any.required": "payment_method is required when generate_invoice is false" }),
      transaction_no: Joi.string().optional().messages({ "string.max": "Transaction number must not exceed 20 characters" }),
      description: Joi.string().max(500).required().messages({ "any.required": "Description is required when generate_invoice is false" }),
      invoice_date: Joi.forbidden(),
      due_date: Joi.forbidden(),
      invoice_amount: Joi.forbidden(),
    }),
  });

export const getInvoiceByIdSchema = Joi.object({
  invoice_id: Joi.string().uuid().required().messages({
    "string.guid": "Invoice ID must be a valid UUID",
    "any.required": "Invoice ID is required",
  }),
});

export const getInvoicesByLeadSchema = Joi.object({
  leads_id: Joi.string().uuid().required().messages({
    "string.guid": "Lead ID must be a valid UUID",
    "any.required": "Lead ID is required",
  }),
});

export const updateInvoiceSchema = Joi.object({
  status: Joi.string()
    .valid("paid", "draft", "unsent", "sent", "ready")
    .optional(),
  description: Joi.string().max(500).optional().allow(null, ""),

  invoice_date: Joi.date().optional(),
  due_date: Joi.date().min(Joi.ref("invoice_date")).optional().messages({
    "date.min": "due_date must be greater than or equal to invoice_date",
  }),
  invoice_amount: Joi.number().precision(2).optional(),

  deposite_date: Joi.date().optional(),
  deposite_amount: Joi.number().precision(2).optional(),
  payment_method: Joi.string()
    .valid("cash", "cheque", "personal_online_transfer", "loan_online_transfer", "EFTPOS")
    .optional(),
  transaction_no: Joi.string().max(20).optional().allow(null, ""),
}).min(1).messages({
  "object.min": "At least one field must be provided for update",
});

export default {
  createInvoiceSchema,
  getInvoiceByIdSchema,
  getInvoicesByLeadSchema,
  updateInvoiceSchema,
};
