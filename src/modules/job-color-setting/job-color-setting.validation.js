import Joi from "joi";

export const createJobColorSettingSchema = Joi.object({
  hide_color_item_images: Joi.boolean().default(false),
  hide_color_item_price: Joi.boolean().default(false),
  exit_color_code: Joi.boolean().default(false),
  page_orientation_portrait: Joi.boolean().default(true),
  header_text: Joi.string().trim().max(500).optional(),
});

export const updateJobColorSettingSchema = Joi.object({
  hide_color_item_images: Joi.boolean().default(false),
  hide_color_item_price: Joi.boolean().default(false),
  exit_color_code: Joi.boolean().default(false),
  page_orientation_portrait: Joi.boolean().default(true),
  header_text: Joi.string().trim().max(500).optional(),
});

export default {
  createJobColorSettingSchema,
  updateJobColorSettingSchema,
};
