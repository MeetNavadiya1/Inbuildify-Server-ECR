import Joi from "joi";

export const createPortalSettingsSchema = Joi.object({
  send_login_credentials_to_customer: Joi.boolean().default(false),
  portal_active_days_after_handover: Joi.number().min(0).max(365),
  send_mail_when_portal_inactive: Joi.boolean().default(false),
  show_site_supervisor_details: Joi.boolean().default(false),
  show_balance_to_pay: Joi.boolean().default(false),
  add_notes_enabled: Joi.boolean().default(false),
  allow_color_selection: Joi.boolean().default(false),
  show_color_cost: Joi.boolean().default(false),
  show_construction_stages: Joi.boolean().default(false),
  auto_share_site_images: Joi.boolean().default(false),
  show_progress_tab: Joi.boolean().default(false),
  default_facade_image: Joi.string().max(500).allow(null, ""),
  publish_packages_to_agent_portal: Joi.boolean().default(false),
});

export const updatePortalSettingsSchema = Joi.object({
  send_login_credentials_to_customer: Joi.boolean(),
  portal_active_days_after_handover: Joi.number().min(0).max(365).optional(),
  send_mail_when_portal_inactive: Joi.boolean(),
  show_site_supervisor_details: Joi.boolean(),
  show_balance_to_pay: Joi.boolean(),
  add_notes_enabled: Joi.boolean(),
  allow_color_selection: Joi.boolean(),
  show_color_cost: Joi.boolean(),
  show_construction_stages: Joi.boolean(),
  auto_share_site_images: Joi.boolean(),
  show_progress_tab: Joi.boolean(),
  default_facade_image: Joi.string().max(500).allow(null, "").optional(),
  publish_packages_to_agent_portal: Joi.boolean(),
});

export default {
  createPortalSettingsSchema,
  updatePortalSettingsSchema,
};
