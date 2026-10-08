import Joi from "joi";

export const updateSalesModuleSettingSchema = Joi.object({
  allow_duplicate_leads: Joi.boolean().optional(),
  send_email_on_new_lead: Joi.boolean().optional(),
  show_common_folders: Joi.boolean().optional(),

  lead_mandatory_option: Joi.string()
    .max(50)
    .valid(
      "email_and_phone",
      "either_email_or_phone",
      "email_not_mandatory",
      "phone_not_mandatory",
      "email_and_phone_not_mandatory",
    )
    .optional(),

  role_id: Joi.array()
    .items(Joi.string().uuid())
    .default([])
    .optional()
    .messages({
      "string.guid": "Role ID must be a valid UUID",
    }),
  sales_won_button_text: Joi.string()
    .max(100)
    .default("Mark as Won")
    .optional(),

  house_size_unit: Joi.string()
    .max(20)
    .valid("sq_m2", "sq_ft")
    .optional()
    .default("sq_m2"),
})
  .min(1)
  .messages({
    "object.min": "At least one field is required to update.",
  });

export default {
  updateSalesModuleSettingSchema,
};
