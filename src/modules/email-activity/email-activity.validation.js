import Joi from "joi";

export const getEmailActivitiesSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1).optional(),
  limit: Joi.number().integer().min(1).max(100).default(20).optional(),
  search: Joi.string().allow("").max(500).optional(),
  delivery_status: Joi.string()
    .valid("PENDING", "SENT", "FAILED")
    .optional()
    .messages({
      "any.only": "delivery_status must be one of: PENDING, SENT, FAILED",
    }),
  notification_type: Joi.string()
    .valid("EMAIL", "SMS")
    .default("EMAIL")
    .optional(),
});

export const getEmailActivityByIdSchema = Joi.object({
  notifications_id: Joi.string().uuid().required().messages({
    "string.guid": "Notification ID must be a valid UUID",
    "any.required": "Notification ID is required",
  }),
});

export default {
  getEmailActivitiesSchema,
  getEmailActivityByIdSchema,
};
