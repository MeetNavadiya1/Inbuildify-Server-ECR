import Joi from "joi";

export const createCampaignSchema = Joi.object({
  name: Joi.string().max(255).allow(null, "").optional(),
  type: Joi.string().valid("email", "sms").default("email"),
  subject: Joi.string().max(500).allow(null, "").optional(),
  content: Joi.string().allow(null, "").optional(),
  attachment_url: Joi.string().max(1000).allow(null, "").optional(),
  attachment: Joi.any().optional(),
  footer_id: Joi.string().uuid().allow(null, "").optional(),
});

export const updateCampaignSchema = Joi.object({
  name: Joi.string().max(255).allow(null, "").optional(),
  type: Joi.string().valid("email", "sms").optional(),
  subject: Joi.string().max(500).allow(null, "").optional(),
  content: Joi.string().allow(null, "").optional(),
  attachment_url: Joi.string().max(1000).allow(null, "").optional(),
  attachment: Joi.any().optional(),
  footer_id: Joi.string().uuid().allow(null, "").optional(),
});

export const campaignIdParamSchema = Joi.object({
  campaign_id: Joi.string().uuid().required().messages({
    "string.guid": "campaign_id must be a valid UUID",
    "any.required": "campaign_id is required",
  }),
});

export const getCampaignsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(25),
  search: Joi.string().max(255).allow("").optional(),
  status: Joi.string().valid("draft", "sent", "all").optional(),
});

export const getContactsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(200).default(50),
  search: Joi.string().max(255).allow("").optional(),
  contact_types: Joi.string().allow("").optional(),
  lead_status: Joi.string().allow("").optional(),
  job_status: Joi.string().allow("").optional(),
  construction: Joi.string().allow("").optional(),
  purpose: Joi.string().allow("").optional(),
  rating: Joi.string().allow("").optional(),
  land: Joi.string().allow("").optional(),
  finance: Joi.string().allow("").optional(),
  client_type_id: Joi.string().uuid().allow(null, "").optional(),
  assignee_id: Joi.string().uuid().allow(null, "").optional(),
  created_at_from: Joi.string().isoDate().allow(null, "").optional(),
  created_at_to: Joi.string().isoDate().allow(null, "").optional(),
  address_type: Joi.string().valid("contact", "property").allow("").optional(),
  address_field: Joi.string()
    .valid("full_address", "suburb", "state", "post_code")
    .allow("")
    .optional(),
  city: Joi.string().max(150).allow("").optional(),
  address_search: Joi.string().max(255).allow("").optional(),
  group_ids: Joi.alternatives().try(
    Joi.array().items(Joi.string().uuid()),
    Joi.string().allow(""),
  ).optional(),
  group_id: Joi.alternatives().try(
    Joi.array().items(Joi.string().uuid()),
    Joi.string().allow(""),
  ).optional(),
});

export const saveContactSelectionSchema = Joi.object({
  contact_filter: Joi.object().allow(null).optional(),
  selected_contact_ids: Joi.array()
    .items(
      Joi.object({
        id: Joi.string().required(),
        type: Joi.string().valid("lead", "contact", "group", "referral", "supplier").required(),
        name: Joi.string().allow("", null).optional(),
        email: Joi.string().allow("", null).optional(),
        address: Joi.string().allow("", null).optional(),
      }).unknown(true)
    )
    .optional(),
});

export const sendTestEmailSchema = Joi.object({
  emails: Joi.array().items(Joi.string().email()).min(1).required().messages({
    "array.min": "At least one email address is required",
  }),
});

export default {
  createCampaignSchema,
  updateCampaignSchema,
  campaignIdParamSchema,
  getCampaignsSchema,
  getContactsSchema,
  saveContactSelectionSchema,
  sendTestEmailSchema,
};
