import Joi from "joi";

/* ========================
   SETTINGS VALIDATION
======================== */

export const upsertSettingsSchema = Joi.object({
  signature_required: Joi.boolean().optional(),
  minimum_audits: Joi.number().integer().min(0).optional(),
});

/* ========================
   LIST ITEM VALIDATION
======================== */

export const createListItemSchema = Joi.object({
  field_type: Joi.string().max(20).valid("category", "item").required(),
  description: Joi.string()
    .min(2)
    .max(500)
    .pattern(/^(?=.*[a-zA-Z])[a-zA-Z0-9\s,./#-]+$/)
    .required(),
  sort_order: Joi.number().integer().min(1).optional(),
  parent_id: Joi.string().uuid().optional().allow(null),
  add_defaults: Joi.boolean().optional(),
});

export const updateListItemSchema = Joi.object({
  description: Joi.string()
    .min(2)
    .max(500)
    .pattern(/^(?=.*[a-zA-Z])[a-zA-Z0-9\s,./#-]+$/)
    .optional(),
  sort_order: Joi.number().integer().min(1).when("field_type", {
    is: "item",
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  add_defaults: Joi.boolean().optional(),
}).min(1);

export const getListItemChema = Joi.object({
  id: Joi.string().uuid().optional(),
  field_type: Joi.string().max(20).valid("category", "item").optional(),
});

export default {
  upsertSettingsSchema,
  createListItemSchema,
  updateListItemSchema,
  getListItemChema,
};
