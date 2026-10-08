import Joi from "joi";

export const createJobCommissionSettingSchema = Joi.object({
  define_outgoing_commission: Joi.boolean().default(false),
  define_incoming_commission: Joi.boolean().default(false),
});

export const updateJobCommissionSettingParamsSchema = Joi.object({
  job_commission_settings_id: Joi.string().uuid().required().messages({
    "string.guid": "ID must be a valid UUID",
    "any.required": "ID is required",
  }),
});

export const updateJobCommissionSettingSchema = Joi.object({
  define_outgoing_commission: Joi.boolean().optional(),
  define_incoming_commission: Joi.boolean().optional(),
});

export default {
  createJobCommissionSettingSchema,
  updateJobCommissionSettingParamsSchema,
  updateJobCommissionSettingSchema,
};
