import Joi from "joi";

export const createAppointmentSchema = Joi.object({
  title: Joi.string()
    .min(2)
    .max(255)
    .pattern(/^[^<>]*$/)
    .required(),

  date: Joi.date().required(),

  start_time: Joi.string()
    .pattern(/^([0-1]\d|2[0-3]):([0-5]\d)$/)
    .required()
    .messages({
      "string.pattern.base": "start_time must be in HH:MM format",
    }),

  end_time: Joi.string()
    .pattern(/^([0-1]\d|2[0-3]):([0-5]\d)$/)
    .required()
    .messages({
      "string.pattern.base": "end_time must be in HH:MM format",
    }),

  location_text: Joi.string()
    .max(500)
    .pattern(/^[^<>]*$/)
    .allow(null, ""),


  lead_id: Joi.string().uuid().optional().messages({
    "string.guid": "lead ID must be a valid UUID",
  }),
  job_id: Joi.string().uuid().optional().messages({
    "string.guid": "job ID must be a valid UUID",
  }),
  link_type: Joi.string().max(255).allow(null, "").optional(),

  select_users: Joi.array().items(Joi.string().uuid()).default([]).messages({
    "string.guid": "users ID must be a valid UUID",
  }),

  notes: Joi.string()
    .max(500)
    .pattern(/^[^<>]*$/)
    .allow(null, ""),

  send_appointment_customer: Joi.boolean().default(false).messages({
    "boolean.base": "send_appointment_customer must be a boolean value",
  }),

  status: Joi.string().valid("yes", "No", "May be").default("No").optional().messages({
    "any.only": 'status must be one of "yes", "No", "May be"',
  }),
});

export const getAllAppointmentSchema = Joi.object({
  title: Joi.string().max(255).optional(),

  date: Joi.string().optional(),

  date_from: Joi.string().isoDate().optional().messages({
    "string.isoDate": "date_from must be a valid ISO date string",
  }),

  date_to: Joi.string().isoDate().optional().messages({
    "string.isoDate": "date_to must be a valid ISO date string",
  }),

  location_text: Joi.string().max(255).optional(),


  lead_id: Joi.string().uuid().optional().messages({
    "string.guid": "lead ID must be a valid UUID",
  }),
  job_id: Joi.string().uuid().optional().messages({
    "string.guid": "job ID must be a valid UUID",
  }),
  link_type: Joi.string().max(255).allow(null, "").optional(),

  assignee_id: Joi.string().uuid().optional().messages({
    "string.guid": "assignee_id must be a valid UUID",
  }),

  include_cancelled: Joi.boolean().optional(),

  is_deleted: Joi.boolean().optional(),

  page: Joi.number().integer().min(1).default(1).messages({
    "number.base": "Page must be a number",
    "number.integer": "Page must be an integer",
    "number.min": "Page must be greater than 0",
  }),

  limit: Joi.number().integer().min(1).max(100).default(25).messages({
    "number.base": "Limit must be a number",
    "number.integer": "Limit must be an integer",
    "number.min": "Limit must be at least 1",
    "number.max": "Limit must not exceed 100",
  }),
});

export const deleteAppointmentSchema = Joi.object({
  appointment_id: Joi.string().uuid().required().messages({
    "string.guid": "appointment ID must be a valid UUID",
    "any.required": "appointment ID is required",
  }),
});

export const updateAppointmentParamsSchema = Joi.object({
  appointment_id: Joi.string().uuid().required().messages({
    "string.guid": "appointment ID must be a valid UUID",
    "any.required": "appointment ID is required",
  }),
});

export const updateAppointmentSchema = Joi.object({
  title: Joi.string()
    .min(2)
    .max(255)
    .pattern(/^[^<>]*$/)
    .optional(),

  date: Joi.date().optional(),

  start_time: Joi.string()
    .pattern(/^([0-1]\d|2[0-3]):([0-5]\d)$/)
    .optional()
    .messages({
      "string.pattern.base": "start_time must be in HH:MM format",
    }),

  end_time: Joi.string()
    .pattern(/^([0-1]\d|2[0-3]):([0-5]\d)$/)
    .optional()
    .messages({
      "string.pattern.base": "end_time must be in HH:MM format",
    }),

  location_text: Joi.string()
    .max(500)
    .pattern(/^[^<>]*$/)
    .allow(null, "")
    .optional(),


  lead_id: Joi.string().uuid().optional().messages({
    "string.guid": "lead ID must be a valid UUID",
  }),

  select_users: Joi.array().items(Joi.string().uuid()).optional().messages({
    "string.guid": "users ID must be a valid UUID",
  }),

  status: Joi.string().valid("yes", "No", "May be").optional().messages({
    "any.only": 'status must be one of "yes", "No", "May be"',
  }),

  notes: Joi.string()
    .max(500)
    .allow(null, "")
    .pattern(/^[^<>]*$/)
    .optional(),

  send_appointment_customer: Joi.boolean().optional().messages({
    "boolean.base": "send_appointment_customer must be a boolean value",
  }),

  status: Joi.string().valid("yes", "No", "May be").optional().messages({
    "any.only": 'status must be one of "yes", "No", "May be"',
  }),
});

export const getAppointmentTabCountsSchema = Joi.object({
  anchor_date: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .messages({
      "string.pattern.base": "anchor_date must be YYYY-MM-DD",
    }),

  title: Joi.string().max(255).optional(),

  assignee_id: Joi.string().uuid().optional().messages({
    "string.guid": "assignee_id must be a valid UUID",
  }),

  include_cancelled: Joi.alternatives()
    .try(Joi.boolean(), Joi.string().valid("true", "false"))
    .optional(),
});

export default {
  createAppointmentSchema,
  getAllAppointmentSchema,
  deleteAppointmentSchema,
  updateAppointmentParamsSchema,
  updateAppointmentSchema,
  getAppointmentTabCountsSchema,
};
