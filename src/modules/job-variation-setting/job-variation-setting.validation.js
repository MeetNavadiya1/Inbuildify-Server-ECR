import Joi from "joi";

export const createJobVariationSettingSchema = Joi.object({
  allow_notes_in_variation: Joi.boolean().default(false),
  allow_cost_adjustment: Joi.boolean().default(false),
  show_notes_in_variation_by_default: Joi.boolean().default(false),
  drawing_changes_required: Joi.boolean().default(false),
  notify_signed_variation: Joi.boolean().default(false),
  notify_signed_variation_only_after_contract_prepared:
    Joi.boolean().default(false),
  allowed_move_job_to_construction_with_pending_variation:
    Joi.boolean().default(false),
  make_requested_by_and_delayed_days_mandatory: Joi.boolean().default(false),
  send_mail_when_variation_self_approved: Joi.boolean().default(false),
  contract_based_variation_header: Joi.boolean().default(false),

  contract_based_variation_header_title: Joi.string()
    .trim()
    .max(255)
    .optional(),
  pre_contract_header: Joi.string().trim().max(255).optional(),
  post_contract_header: Joi.string().trim().max(255).optional(),

  notify_signed_variation_user_ids: Joi.array()
    .items(Joi.string().guid({ version: "uuidv4" }))
    .optional()
    .messages({
      "string.guid": "notify signed variation user id  must be a valid UUID",
    }),
  notify_signed_variation_group_ids: Joi.array()
    .items(Joi.string().guid({ version: "uuidv4" }))
    .optional()
    .messages({
      "string.guid": "notify signed variation group id  must be a valid UUID",
    }),

  notify_after_contract_user_ids: Joi.array()
    .items(Joi.string().guid({ version: "uuidv4" }))
    .optional()
    .messages({
      "string.guid": "notify after contract user id  must be a valid UUID",
    }),

  notify_after_contract_group_ids: Joi.array()
    .items(Joi.string().guid({ version: "uuidv4" }))
    .optional()
    .messages({
      "string.guid": "notify after contract group id  must be a valid UUID",
    }),
});

export const updateJobVariationSettingParamsSchema = Joi.object({
  id: Joi.string().uuid().required().messages({
    "string.guid": "job variation setting ID must be a valid UUID",
    "any.required": "job variation setting ID is required",
  }),
});

export const updateJobVariationSettingSchema = Joi.object({
  allow_notes_in_variation: Joi.boolean().optional(),
  allow_cost_adjustment: Joi.boolean().optional(),
  show_notes_in_variation_by_default: Joi.boolean().optional(),
  drawing_changes_required: Joi.boolean().optional(),
  notify_signed_variation: Joi.boolean().optional(),
  notify_signed_variation_only_after_contract_prepared:
    Joi.boolean().optional(),
  allowed_move_job_to_construction_with_pending_variation:
    Joi.boolean().optional(),
  make_requested_by_and_delayed_days_mandatory: Joi.boolean().optional(),
  send_mail_when_variation_self_approved: Joi.boolean().optional(),
  contract_based_variation_header: Joi.boolean().optional(),

  contract_based_variation_header_title: Joi.string()
    .trim()
    .max(255)
    .optional(),
  pre_contract_header: Joi.string().trim().max(255).optional(),
  post_contract_header: Joi.string().trim().max(255).optional(),

  notify_signed_variation_user_ids: Joi.array()
    .items(Joi.string().guid({ version: "uuidv4" }))
    .optional()
    .messages({
      "string.guid": "notify signed variation user id  must be a valid UUID",
    }),

  notify_signed_variation_group_ids: Joi.array()
    .items(Joi.string().guid({ version: "uuidv4" }))
    .optional()
    .messages({
      "string.guid": "notify signed variation group id  must be a valid UUID",
    }),

  notify_after_contract_user_ids: Joi.array()
    .items(Joi.string().guid({ version: "uuidv4" }))
    .optional()
    .messages({
      "string.guid": "notify after contract user id  must be a valid UUID",
    }),

  notify_after_contract_group_ids: Joi.array()
    .items(Joi.string().guid({ version: "uuidv4" }))
    .optional()
    .messages({
      "string.guid": "notify after contract group id  must be a valid UUID",
    }),
});

export default {
  createJobVariationSettingSchema,
  updateJobVariationSettingParamsSchema,
  updateJobVariationSettingSchema,
};
