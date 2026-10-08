import Joi from "joi";

const FIELD_TYPES = ["text", "checkbox", "textarea", "phone", "email"];
const CATEGORIES = ["personal", "ppe", "safety", "other"];
const STATUSES = ["PENDING", "CONFIRMED", "REJECTED"];

// ─── Fields (builder side) ──────────────────────────────────────────────────

export const createFieldSchema = Joi.object({
  label: Joi.string().trim().min(1).max(255).required(),
  type: Joi.string().valid(...FIELD_TYPES).default("text"),
  category: Joi.string().valid(...CATEGORIES).default("other"),
  is_mandatory: Joi.boolean().default(false),
  is_active: Joi.boolean().default(true),
  display_order: Joi.number().integer().min(0).default(0),
});

export const updateFieldSchema = Joi.object({
  label: Joi.string().trim().min(1).max(255).optional(),
  type: Joi.string().valid(...FIELD_TYPES).optional(),
  category: Joi.string().valid(...CATEGORIES).optional(),
  is_mandatory: Joi.boolean().optional(),
  is_active: Joi.boolean().optional(),
  display_order: Joi.number().integer().min(0).optional(),
})
  .min(1)
  .messages({ "object.min": "At least one field must be provided to update." });

export const fieldIdParamsSchema = Joi.object({
  site_checkin_field_id: Joi.string().uuid().required().messages({
    "string.guid": "site_checkin_field_id must be a valid UUID.",
  }),
});

// ─── Records (builder side) ─────────────────────────────────────────────────

export const listRecordsSchema = Joi.object({
  job_id: Joi.string().trim().max(255).optional(),
  status: Joi.string().valid(...STATUSES).optional(),
});

export const recordIdParamsSchema = Joi.object({
  site_checkin_record_id: Joi.string().uuid().required().messages({
    "string.guid": "site_checkin_record_id must be a valid UUID.",
  }),
});

export const confirmRejectSchema = Joi.object({
  confirmed_by: Joi.string().trim().max(255).optional().allow("", null),
  builder_notes: Joi.string().trim().max(1000).optional().allow("", null),
});

// ─── Public (supplier side, no auth) ────────────────────────────────────────

export const publicTokenParamsSchema = Joi.object({
  token: Joi.string().uuid().required().messages({
    "string.guid": "Invalid check-in link.",
    "any.required": "Invalid check-in link.",
  }),
});

export const publicSubmitSchema = Joi.object({
  supplier_name: Joi.string().trim().max(255).optional().allow("", null),
  company_name: Joi.string().trim().max(255).optional().allow("", null),
  phone: Joi.string().trim().max(50).optional().allow("", null),
  email: Joi.string().trim().email().optional().allow("", null).messages({
    "string.email": "Please enter a valid email address.",
  }),
  job_id: Joi.string().trim().max(255).optional().allow("", null),
  job_address: Joi.string().trim().max(255).optional().allow("", null),
  // Keys MUST be field UUIDs (rejects arbitrary/injected keys); values are size-
  // capped and limited in count so a payload can't bloat the DB. The service
  // additionally drops any key that isn't an active field for this company.
  responses: Joi.object()
    .pattern(
      Joi.string().uuid(),
      Joi.alternatives().try(Joi.string().allow("").max(2000), Joi.boolean(), Joi.number()),
    )
    .max(100)
    .required()
    .messages({
      "any.required": "responses is required.",
      "object.max": "Too many response fields.",
      "object.unknown": "Invalid response field.",
    }),
});

export default {
  createFieldSchema,
  updateFieldSchema,
  fieldIdParamsSchema,
  listRecordsSchema,
  recordIdParamsSchema,
  confirmRejectSchema,
  publicTokenParamsSchema,
  publicSubmitSchema,
};
