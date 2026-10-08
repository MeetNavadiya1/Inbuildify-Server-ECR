import Joi from "joi";

export const createSmsSchema = Joi.object({
  leads_id: Joi.string().uuid().required().messages({
    "string.uuid": "leads_id must be a valid UUID",
    "any.required": "leads_id is required",
  }),
  recipient_id: Joi.string().uuid().allow(null).optional().messages({
    "string.uuid": "recipient_id must be a valid UUID",
  }),
  message: Joi.string().max(500).required().messages({
    "string.max": "message must be at most 500 characters",
    "any.required": "message is required",
  }),
});

export const updateSmsSchema = Joi.object({
  recipient_id: Joi.string().uuid().allow(null).optional(),
  message: Joi.string().max(500).optional(),
});

export const getAllSmsSchema = Joi.object({
  leads_id: Joi.string().uuid().optional(),
  recipient_id: Joi.string().uuid().optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(25),
});

export const smsParamsSchema = Joi.object({
  sms_id: Joi.string().uuid().required().messages({
    "string.uuid": "sms_id must be a valid UUID",
    "any.required": "sms_id is required",
  }),
})
export default {
  createSmsSchema,
  updateSmsSchema,
  getAllSmsSchema,
  smsParamsSchema,
};
