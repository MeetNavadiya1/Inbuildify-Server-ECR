import Joi from "joi";

/* =========================
   Reusable helpers
========================= */

const hexColor = Joi.string()
  .pattern(/^#([0-9A-Fa-f]{3}){1,2}$/)
  .allow(null, "");

const pageHeaderFooterSchema = Joi.object({
  background_color: hexColor,
  font_color: hexColor.optional(),
  font_size: Joi.number().integer().min(1).optional(),
  title: Joi.string().allow("").optional(),
});

const logoSettingsSchema = Joi.object({
  alignment: Joi.string().valid("left", "center", "right").optional(),
  height: Joi.number().integer().min(1).optional(),
  width: Joi.number().integer().min(1).optional(),
  padding: Joi.number().allow(null),
  logo_image: Joi.string().allow(null, ""),
  watermark_image: Joi.string().allow(null, ""),
});

const colorBlockSchema = Joi.object({
  background_color: hexColor,
  font_color: hexColor,
});

const showDetailsBaseSchema = {
  account: Joi.string().optional(),
  address: Joi.string().valid("header", "footer", "none").optional(),
  contact: Joi.string().valid("header", "footer", "none").optional(),
  bank_information: Joi.string().optional(),
};

/* =========================
   Format schemas
========================= */

const invoiceFormatSchema = Joi.object({
  show_details: Joi.object({
    ...showDetailsBaseSchema,
    bank_information: Joi.string().optional(),
  }).required(),

  page_header: pageHeaderFooterSchema.required(),
  page_footer: pageHeaderFooterSchema.required(),
  logo_settings: logoSettingsSchema.required(),

  list_items: Joi.object({
    header: colorBlockSchema.required(),
    footer: colorBlockSchema.optional(),
  }).optional(),

  bank_details: Joi.object({
    header_text: Joi.string().optional(),
  }).optional(),

  custom_text: Joi.string().allow("").optional(),
  initial_deposit_description: Joi.string().optional(),
});

const receiptFormatSchema = Joi.object({
  show_details: Joi.object({
    ...showDetailsBaseSchema,
    bank_information: Joi.string().optional(),
  }).required(),

  page_header: pageHeaderFooterSchema.required(),
  page_footer: pageHeaderFooterSchema.required(),
  logo_settings: logoSettingsSchema.required(),

  bank_details: Joi.object({
    header_text: Joi.string().optional(),
  }).optional(),

  custom_text: Joi.string().allow("").optional(),
});

const variationFormatSchema = Joi.object({
  show_details: Joi.object({
    ...showDetailsBaseSchema,
    bank_information: Joi.string().optional(),
  }).required(),

  page_header: pageHeaderFooterSchema.required(),
  page_footer: pageHeaderFooterSchema.required(),
  logo_settings: logoSettingsSchema.required(),

  list_items: Joi.object({
    header: colorBlockSchema.optional(),
    footer: colorBlockSchema.optional(),
  }).optional(),

  sub_items: Joi.object({
    header: colorBlockSchema.optional(),
    show_unit_option: Joi.string().valid("hide", "show").optional().default("hide"),
  }).optional(),

  bank_details: Joi.object({
    header_text: Joi.string().optional(),
  }).optional(),

  custom_text: Joi.string().allow("").optional(),
  total_cost_custom_text: Joi.string().allow("").optional(),
  enable_builder_signature: Joi.boolean().optional(),
});

const colorFormatSchema = Joi.object({
  show_details: Joi.object({
    ...showDetailsBaseSchema,
    use_label_info: Joi.boolean().optional(),
  }).required(),

  page_header: pageHeaderFooterSchema.required(),
  page_footer: pageHeaderFooterSchema.required(),
  logo_settings: logoSettingsSchema.required(),

  list_items: Joi.object({
    header: colorBlockSchema.optional(),
    footer: colorBlockSchema.optional(),
  }).optional(),

  cost_type_styles: Joi.object({
    standard: colorBlockSchema.required(),
    upgrade: colorBlockSchema.required(),
  }).required(),

  custom_text: Joi.string().allow("").optional(),
  enable_builder_signature: Joi.boolean().optional(),
});

const maintenanceFormatSchema = Joi.object({
  show_details: Joi.object(showDetailsBaseSchema).required(),

  page_header: pageHeaderFooterSchema.required(),
  page_footer: pageHeaderFooterSchema.required(),
  logo_settings: logoSettingsSchema.required(),

  list_items: Joi.object({
    header: colorBlockSchema.required(),
  }).optional(),
});

/* =========================
   Helper: make schemas partial
========================= */

function makePartial(schema) {
  const desc = schema.describe();
  return schema.fork(Object.keys(desc.keys), (field) => field.optional());
}

/* =========================
   CREATE (strict)
========================= */

export const createTemplatePdfSchema = Joi.object({
  name: Joi.string().max(200).required(),

  invoice_format: invoiceFormatSchema.required(),
  receipt_format: receiptFormatSchema.required(),
  variation_format: variationFormatSchema.required(),
  color_format: colorFormatSchema.required(),
  maintenance_format: maintenanceFormatSchema.required(),
}).required();

/* =========================
   UPDATE (partial)
========================= */

export const updateTemplatePdfSchema = Joi.object({
  // name: Joi.string().max(200).optional(),
  format_type: Joi.string().required(),
}).unknown(true);

const formatSchemas = {
  invoice_format: makePartial(invoiceFormatSchema),
  receipt_format: makePartial(receiptFormatSchema),
  variation_format: makePartial(variationFormatSchema),
  color_format: makePartial(colorFormatSchema),
  maintenance_format: makePartial(maintenanceFormatSchema),
};

export function getFormatValidationSchema(type) {
  return formatSchemas[type];
}

export default {
  createTemplatePdfSchema,
  updateTemplatePdfSchema,
  getFormatValidationSchema,
};
