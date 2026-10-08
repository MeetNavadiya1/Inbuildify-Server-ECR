import Joi from "joi";

export const createQuotationFormatSchema = Joi.object({
  role_id: Joi.string().uuid().allow(null, "").required(),
  format_name: Joi.string().max(255).trim().required(),
  logo_alignment: Joi.string().valid("center", "left", "right").optional(),
  logo_size_height: Joi.number().precision(2).optional(),
  logo_size_width: Joi.number().precision(2).optional(),
  logo_padding: Joi.string().max(255).optional(),
  hide_logo_first_page: Joi.boolean().default(false),
  label_logo_size_height: Joi.number().precision(2).optional(),
  label_logo_size_width: Joi.number().precision(2),
  show_account: Joi.string()
    .valid("company_account", "builder_account")
    .optional(),
  show_excel: Joi.boolean().default(false),
  watermark: Joi.string().max(500).allow(null, "").optional(),
  default_facade: Joi.string().max(500).allow(null, "").optional(),
  draft_background_image: Joi.string().max(500).allow(null, "").optional(),
  draft_background: Joi.boolean().default(false),
  hide_watermark: Joi.boolean().default(false),
  status: Joi.boolean().default(true),
  make_default: Joi.boolean().default(false),
  include_package_price_list: Joi.boolean().default(false),
  show_quotation_with_builder: Joi.boolean().default(false),
  show_quotation_with_builder_detailed: Joi.boolean().default(false),
  show_job_address: Joi.boolean().default(false),
  footer_column_count: Joi.number().valid(1, 2, 3).default(1),
  custom_footer: Joi.boolean().default(false),
  bg_color: Joi.string().max(100).allow(null, "").optional(),
  description: Joi.string().max(255).allow(null, "").optional(),
  description2: Joi.string().max(255).allow(null, "").optional(),
  description3: Joi.string().max(255).allow(null, "").optional(),

});

export const updateQuotationFormatSchema = Joi.object({

  role_id: Joi.string().uuid().allow(null, "").required(),
  format_name: Joi.string().max(255).allow(null, "").optional(),
  logo_alignment: Joi.string().valid("center", "left", "right").optional(),
  logo_size_height: Joi.number().precision(2).optional(),
  logo_size_width: Joi.number().precision(2).optional(),
  logo_padding: Joi.string().max(255).optional(),
  hide_logo_first_page: Joi.boolean().optional(),
  label_logo_size_height: Joi.number().precision(2).optional(),
  label_logo_size_width: Joi.number().precision(2).optional(),
  show_account: Joi.string()
    .valid("company_account", "builder_account")
    .optional(),
  show_excel: Joi.boolean().optional(),
  watermark: Joi.string().max(500).allow(null, "").optional(),
  default_facade: Joi.string().max(500).allow(null, "").optional(),
  draft_background_image: Joi.string().max(500).allow(null, "").optional(),
  draft_background: Joi.boolean().optional(),
  hide_watermark: Joi.boolean().optional(),
  status: Joi.boolean().optional(),
  make_default: Joi.boolean().optional(),
  include_package_price_list: Joi.boolean().optional(),
  show_quotation_with_builder: Joi.boolean().optional(),
  show_quotation_with_builder_detailed: Joi.boolean().optional(),
  show_job_address: Joi.boolean().optional(),
  footer_column_count: Joi.number().valid(1, 2, 3).optional(),
  custom_footer: Joi.boolean().optional(),
  bg_color: Joi.string().max(100).allow(null, "").optional(),
  description: Joi.string().max(255).allow(null, "").optional(),
  description2: Joi.string().max(255).allow(null, "").optional(),
  description3: Joi.string().max(255).allow(null, "").optional(),
}).min(1);

export const getAllQuotationFormatSchema = Joi.object({
  format_name: Joi.string().max(255).optional(),
  status: Joi.boolean().optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
});

export const quotationFormatIdSchema = Joi.object({
  quotation_format_id: Joi.string().uuid().required(),
});

export default {
  createQuotationFormatSchema,
  updateQuotationFormatSchema,
  getAllQuotationFormatSchema,
  quotationFormatIdSchema,
};
