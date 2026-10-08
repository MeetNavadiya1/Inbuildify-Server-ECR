import Joi from "joi";

export const createIntegrationSettingsSchema = Joi.object({
  automatically_send_welcome_email: Joi.boolean().optional(),
  rea_hl_enabled: Joi.boolean().optional(),
  canibuild_enabled: Joi.boolean().optional(),
  website_hl_enabled: Joi.boolean().optional(),
  google_enabled: Joi.boolean().optional(),

  assign_leads_if_assignee_not_found: Joi.string()
    .uuid()
    .allow(null)
    .optional()
    .messages({
      "string.guid": "assign_leads_if_assignee_not_found must be a valid UUID.",
    }),

  always_assign_leads_to: Joi.string().uuid().allow(null).optional().messages({
    "string.guid": "always_assign_leads_to must be a valid UUID.",
  }),
});

export const updateIntegrationSettingSchema = Joi.object({
  automatically_send_welcome_email: Joi.boolean().optional(),
  rea_hl_enabled: Joi.boolean().optional(),
  canibuild_enabled: Joi.boolean().optional(),
  website_hl_enabled: Joi.boolean().optional(),
  google_enabled: Joi.boolean().optional(),

  assign_leads_if_assignee_not_found: Joi.string()
    .uuid()
    .allow(null)
    .optional()
    .messages({
      "string.guid": "assign_leads_if_assignee_not_found must be a valid UUID.",
    }),

  always_assign_leads_to: Joi.string().uuid().allow(null).optional().messages({
    "string.guid": "always_assign_leads_to must be a valid UUID.",
  }),
});

export default {
  createIntegrationSettingsSchema,
  updateIntegrationSettingSchema,
};
