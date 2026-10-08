import Joi from "joi";
// Validated against the same list the rule reads, so a key the classifier never
// returns cannot be stored — a checkbox that silently switches nothing off is
// worse than no checkbox.
import { DOCUMENT_TYPE_KEYS } from "../../utils/documentEdit.js";

const allowedShowReferenceValues = [
  "document_id",
  "job_id",
  "document_id_and_job_id",
  "hide_document_id_and_job_id",
];

export const createGeneralSettigSchema = Joi.object({
  notification_referral_partner: Joi.boolean().optional().default(false),
  pdf_password_protected: Joi.boolean().optional().default(false),

  pdf_password: Joi.when("pdf_password_protected", {
    is: true,
    then: Joi.string().trim().min(3).max(255).required().messages({
      "any.required":
        "PDF password is required when password protection is enabled.",
      "string.empty": "PDF password cannot be empty.",
    }),
    otherwise: Joi.string().allow(null, "").optional(),
  }),

  round_of_cost: Joi.boolean().optional().default(false),
  negative_value_show: Joi.boolean().optional().default(true),
  negative_value_color: Joi.string()
    .trim()
    .pattern(/^#([0-9A-F]{3}|[0-9A-F]{6})$/i)
    .optional()
    .allow(null)
    .messages({
      "string.pattern.base":
        "Enter valid font color in HEX format (e.g., #FFF453)",
    }),

  show_reference_id_in_pdf: Joi.string()
    .valid(...allowedShowReferenceValues)
    .default("hide_document_id_and_job_id")
    .messages({
      "any.only": `show_reference_id_in_pdf must be one of: ${allowedShowReferenceValues.join(
        ", ",
      )}`,
    }),

  job_id_label: Joi.string().max(100).allow(null, "").optional(),
  editable_pdf_types: Joi.array().items(Joi.string()).optional().default([]),
  // Reference-type keys nobody may edit. A blocklist: absent or empty means
  // nothing is restricted, which is what every tenant has by default.
  non_editable_document_types: Joi.array().items(Joi.string().valid(...DOCUMENT_TYPE_KEYS)).optional().default([]),
});

export const updateGeneralSettingsSchema = Joi.object({
  notification_referral_partner: Joi.boolean().optional().default(false),
  pdf_password_protected: Joi.boolean().optional().default(false),

  pdf_password: Joi.optional().when("pdf_password_protected", {
    is: true,
    then: Joi.string().trim().min(3).max(255).required().messages({
      "any.required":
        "PDF password is required when password protection is enabled.",
      "string.empty": "PDF password cannot be empty.",
    }),
    otherwise: Joi.string().allow(null, "").optional(),
  }),

  round_of_cost: Joi.boolean().optional().default(false),
  negative_value_show: Joi.boolean().optional().default(true),
  negative_value_color: Joi.string()
    .trim()
    .pattern(/^#([0-9A-F]{3}|[0-9A-F]{6})$/i)
    .optional()
    .allow(null)
    .messages({
      "string.pattern.base":
        "Enter valid font color in HEX format (e.g., #FFF453)",
    }),

  show_reference_id_in_pdf: Joi.string()
    .valid(...allowedShowReferenceValues)
    .optional()
    .default("hide_document_id_and_job_id")
    .messages({
      "any.only": `show_reference_id_in_pdf must be one of: ${allowedShowReferenceValues.join(
        ", ",
      )}`,
    }),

  job_id_label: Joi.string().max(100).allow(null, "").optional(),
  editable_pdf_types: Joi.array().items(Joi.string()).optional(),
  non_editable_document_types: Joi.array().items(Joi.string().valid(...DOCUMENT_TYPE_KEYS)).optional(),
});

export default {
  createGeneralSettigSchema,
  updateGeneralSettingsSchema,
};
