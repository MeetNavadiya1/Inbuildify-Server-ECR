import Joi from "joi";
import { NAME_PATTERN, NAME_PATTERN_MESSAGE } from "../../utils/validationPatterns.js";

export const deleteSchedulerEmailSchema = Joi.object({
  scheduler_email_id: Joi.string().uuid().required().messages({
    "string.guid": "ID must be a valid UUID",
    "any.required": "ID is required",
  }),
});

export const getSchedulerEmailSchema = Joi.object({
  is_active: Joi.boolean().optional(),
});

export const updateSchedulerEmailParamsSchema = Joi.object({
  scheduler_email_id: Joi.string().uuid().required().messages({
    "string.guid": "scheduler email ID must be a valid UUID",
    "any.required": "scheduler email ID is required",
  }),
});

export const updateSchedulerEmailSchema = Joi.object({
  name: Joi.string()
    .min(2)
    .max(200)
    .pattern(NAME_PATTERN)
    .optional(),
  frequency: Joi.string().valid("daily", "weekly", "monthly").optional(),
  send_to_all_active_users: Joi.boolean(),
  notification_recipient_users: Joi.array()
    .items(Joi.string().uuid())
    .default([])
    .messages({
      "string.guid": "User ID must be a valid UUID",
    }),
  reply_to_users: Joi.array().items(Joi.string().uuid()).default([]).messages({
    "string.guid": "User ID must be a valid UUID",
  }),
  subject: Joi.string()
    .min(2)
    .max(255)
    .pattern(/^(?=.*[a-zA-Z])[a-zA-Z0-9\s,./#-]+$/)
    .optional(),
  message_body: Joi.string().optional(),
  no_of_action_days: Joi.number().integer().min(0).optional(),
  no_record_message: Joi.boolean(),
  exclude_recipients: Joi.array()
    .items(Joi.string().uuid())
    .default([])
    .messages({
      "string.guid": "User ID must be a valid UUID",
    }),
  no_record_message_body: Joi.when("no_record_message", {
    is: true,
    then: Joi.string().optional(),
    otherwise: Joi.forbidden().messages({
      "any.unknown":
        "You cannot provide no_record_message_body when no_record_message is false.",
    }),
  }),
  attach_files: Joi.string().allow(null, "").optional(),
  attachFiles: Joi.string().allow(null, "").optional(),
  is_active: Joi.boolean(),
});

export default {
  deleteSchedulerEmailSchema,
  updateSchedulerEmailParamsSchema,
  updateSchedulerEmailSchema,
  getSchedulerEmailSchema,
};
