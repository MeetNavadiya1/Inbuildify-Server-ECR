import Joi from "joi";

export const updatePasswordPolicyIdParamsSchema = Joi.object({
  password_policy_id: Joi.string().uuid().required().messages({
    "string.guid": "Role ID must be a valid UUID",
    "any.required": "Role ID is required",
  }),
});

export const updatePasswordPolicySchema = Joi.object({
  expires_in_days: Joi.number()
    .integer()
    .min(1)
    .max(365)
    .default(90)
    .optional()
    .messages({
      "number.base": "Expires in days must be a number.",
      "number.integer": "Expires in days must be an integer.",
      "number.min": "Expires in days must be at least 1 day.",
      "number.max": "Expires in days cannot exceed 365 days.",
    }),
  invalid_attempt_limit: Joi.number()
    .integer()
    .min(1)
    .max(10)
    .default(5)
    .optional()
    .messages({
      "number.base": "Invalid attempt limit must be a number.",
      "number.integer": "Invalid attempt limit must be an integer.",
      "number.min": "Invalid attempt limit must be at least 1.",
      "number.max": "Invalid attempt limit cannot exceed 10.",
    }),

  alert_before_expiry_days: Joi.number()
    .integer()
    .min(1)
    .max(Joi.ref("expires_in_days"))
    .default(7)
    .optional()
    .messages({
      "number.base": "Alert before expiry must be a number.",
      "number.integer": "Alert before expiry must be an integer.",
      "number.min": "Alert before expiry must be at least 1 day.",
      "number.max": "Alert days cannot be greater than expires_in_days.",
    }),
  password_history_count: Joi.number()
    .integer()
    .min(1)
    .max(20)
    .default(5)
    .optional()
    .messages({
      "number.base": "Password history count must be a number.",
      "number.integer": "Password history count must be an integer.",
      "number.min": "Password history count must be at least 1.",
      "number.max": "Password history count cannot exceed 20.",
    }),

  enforce_strong_password: Joi.boolean().optional().messages({
    "boolean.base": "Enforce strong password must be true or false.",
  }),
})
  .min(1)
  .messages({
    "object.min": "At least one field is required to update.",
  });

export default {
  updatePasswordPolicyIdParamsSchema,
  updatePasswordPolicySchema,
};
