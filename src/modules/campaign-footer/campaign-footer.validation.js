import Joi from "joi";

export const createCampaignFooterSchema = Joi.object({
  name: Joi.string().min(1).max(255).required(),
  content: Joi.string().allow(null, "").optional(),
  background_color: Joi.string().max(50).allow(null, "").optional(),
  is_default: Joi.boolean().default(false),
});

export const updateCampaignFooterSchema = Joi.object({
  name: Joi.string().min(1).max(255).optional(),
  content: Joi.string().allow(null, "").optional(),
  background_color: Joi.string().max(50).allow(null, "").optional(),
  is_default: Joi.boolean().optional(),
});

export const footerIdParamSchema = Joi.object({
  footer_id: Joi.string().uuid().required().messages({
    "string.guid": "footer_id must be a valid UUID",
    "any.required": "footer_id is required",
  }),
});

export default {
  createCampaignFooterSchema,
  updateCampaignFooterSchema,
  footerIdParamSchema,
};
