import Joi from "joi";

// Body is snake_cased by camelToSnakeMiddleware before it reaches validation.
export const jobVariationParamsSchema = Joi.object({
  job_id: Joi.string().uuid().required().messages({
    "string.guid": "Job ID must be a valid UUID",
    "any.required": "Job ID is required",
  }),
});

export const variationIdParamsSchema = Joi.object({
  variation_id: Joi.string().uuid().required().messages({
    "string.guid": "Variation ID must be a valid UUID",
    "any.required": "Variation ID is required",
  }),
});

// Variation line items are stored as-is (JSONB); keep validation permissive.
const itemsSchema = Joi.array().items(Joi.object().unknown(true)).optional();

const variationBodyFields = {
  title: Joi.string().allow("", null).optional(),
  amount: Joi.number().min(0).optional(),
  requested_by: Joi.string().allow("", null).optional(),
  delayed_by: Joi.string().allow("", null).optional(),
  delayed_days: Joi.number().integer().min(0).allow(null).optional(),
  drawing_changes_required: Joi.boolean().optional(),
  status: Joi.string().valid("draft", "approved").optional(),
  stage: Joi.number().integer().min(1).max(20).optional(),
  price_included: Joi.boolean().allow(null).optional(),
  invoice_id: Joi.string().uuid().allow(null, "").optional(),
  variation_date: Joi.date().iso().allow(null).optional(),
  show_price_master_in_pdf: Joi.boolean().optional(),
  items: itemsSchema,
};

export const createJobVariationSchema = {
  params: jobVariationParamsSchema,
  body: Joi.object(variationBodyFields),
};

export const updateJobVariationSchema = {
  params: variationIdParamsSchema,
  body: Joi.object(variationBodyFields),
};

// Send variation approval email. Body is snake_cased (sendCopy -> send_copy).
export const sendVariationEmailSchema = {
  params: variationIdParamsSchema,
  body: Joi.object({
    to: Joi.array().items(Joi.string()).min(1).required().messages({
      "array.min": "At least one recipient is required",
      "any.required": "Recipient list is required",
    }),
    subject: Joi.string().required().messages({
      "any.required": "Subject is required",
      "string.empty": "Subject is required",
    }),
    content: Joi.string().allow("", null).optional(),
    send_copy: Joi.boolean().optional(),
    approve: Joi.boolean().optional(),
    attach_pdf: Joi.boolean().optional(),
    // Files uploaded in the composer, sent as base64 (data URL or raw base64).
    attachments: Joi.array()
      .items(
        Joi.object({
          filename: Joi.string().required(),
          content: Joi.string().required(),
          content_type: Joi.string().allow("", null).optional(),
        }).unknown(true),
      )
      .optional(),
  }),
};

// Send the invoice to the customer (tracker step 6). The invoice PDF is
// generated server-side, so there is no attach_pdf/approve flag here.
export const sendInvoiceEmailSchema = {
  params: variationIdParamsSchema,
  body: Joi.object({
    to: Joi.array().items(Joi.string()).min(1).required().messages({
      "array.min": "At least one recipient is required",
      "any.required": "Recipient list is required",
    }),
    subject: Joi.string().required().messages({
      "any.required": "Subject is required",
      "string.empty": "Subject is required",
    }),
    content: Joi.string().allow("", null).optional(),
    send_copy: Joi.boolean().optional(),
    // Files uploaded in the composer, sent as base64 (data URL or raw base64).
    attachments: Joi.array()
      .items(
        Joi.object({
          filename: Joi.string().required(),
          content: Joi.string().required(),
          content_type: Joi.string().allow("", null).optional(),
        }).unknown(true),
      )
      .optional(),
  }),
};

export default {
  jobVariationParamsSchema,
  variationIdParamsSchema,
  createJobVariationSchema,
  updateJobVariationSchema,
  sendVariationEmailSchema,
  sendInvoiceEmailSchema,
};
