import Joi from "joi";

const ACTION_TYPES = ["task", "note", "appointment", "sms"];

// --- Create ---

export const createActionParamsSchema = Joi.object({
  leads_id: Joi.string().uuid().required().messages({
    "string.guid": "Leads ID must be a valid UUID",
    "any.required": "Leads ID is required",
  }),
});

const noteSchema = Joi.object({
  action_type: Joi.string().valid("note").required(),
  description: Joi.string().max(500).allow(null, "").optional(),
  notes_tag_id: Joi.array().items(Joi.string().uuid()).optional().allow(null),
  send_to_customer: Joi.boolean().optional().allow(null),
  create_follow_up_task: Joi.boolean().optional().allow(null),
  attach_file: Joi.string().max(500).allow(null, "").optional(),
});

const smsSchema = Joi.object({
  action_type: Joi.string().valid("sms").required(),
  users_id: Joi.array().items(Joi.string().uuid()).required().messages({
    "any.required": "users_id is required for SMS action type",
  }),
  description: Joi.string().max(500).allow(null, "").optional(),
});

const appointmentSchema = Joi.object({
  action_type: Joi.string().valid("appointment").required(),
  name: Joi.string().max(255).allow(null, "").optional(),
  due_date: Joi.date().allow(null).optional(),
  end_date: Joi.date().allow(null).optional(),
  location_id: Joi.string().uuid().allow(null).optional(),
  start_time: Joi.string()
    .pattern(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/)
    .allow(null, "")
    .optional(),
  end_time: Joi.string()
    .pattern(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/)
    .allow(null, "")
    .optional(),
  users_id: Joi.array().items(Joi.string().uuid()).optional().allow(null),
  description: Joi.string().max(500).allow(null, "").optional(),
  send_to_customer: Joi.boolean().optional().allow(null),
});

const taskSchema = Joi.object({
  action_type: Joi.string().valid("task").required(),
  name: Joi.string().max(255).allow(null, "").optional(),
  due_date: Joi.date().allow(null).optional(),
  end_time: Joi.string()
    .pattern(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/)
    .allow(null, "")
    .optional(),
  users_id: Joi.array().items(Joi.string().uuid()).optional().allow(null),
  priority: Joi.string().valid("low", "medium", "high").allow(null).optional(),
  status: Joi.string()
    .valid("completed", "yet_to_start", "in_progress", "skipped", "cancelled")
    .allow(null)
    .optional(),
  link_to_user: Joi.string().uuid().allow(null).optional(),
  description: Joi.string().max(500).allow(null, "").optional(),
  attach_file: Joi.string().max(500).allow(null, "").optional(),
});

export const createActionBodySchema = Joi.alternatives()
  .try(noteSchema, smsSchema, appointmentSchema, taskSchema)
  .required();

// --- Get ---

export const getActionsParamsSchema = Joi.object({
  leads_id: Joi.string().uuid().required().messages({
    "string.guid": "Leads ID must be a valid UUID",
    "any.required": "Leads ID is required",
  }),
});

export const getActionsQuerySchema = Joi.object({
  action_type: Joi.string()
    .valid(...ACTION_TYPES)
    .optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(25),
});

// --- Update ---

export const updateActionParamsSchema = Joi.object({
  action_id: Joi.string().uuid().required().messages({
    "string.guid": "Action ID must be a valid UUID",
    "any.required": "Action ID is required",
  }),
});

export const updateActionBodySchema = Joi.object({
  // action_type is NOT allowed on update
  description: Joi.string().max(500).allow(null, "").optional(),
  notes_tag_id: Joi.array().items(Joi.string().uuid()).optional().allow(null),
  send_to_customer: Joi.boolean().optional().allow(null),
  create_follow_up_task: Joi.boolean().optional().allow(null),
  attach_file: Joi.string().max(500).allow(null, "").optional(),

  users_id: Joi.array().items(Joi.string().uuid()).optional().allow(null),

  name: Joi.string().max(255).allow(null, "").optional(),
  due_date: Joi.date().allow(null).optional(),
  end_date: Joi.date().allow(null).optional(),
  location_id: Joi.string().uuid().allow(null).optional(),
  start_time: Joi.string()
    .pattern(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/)
    .allow(null, "")
    .optional(),
  end_time: Joi.string()
    .pattern(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/)
    .allow(null, "")
    .optional(),

  priority: Joi.string().valid("low", "medium", "high").allow(null).optional(),
  status: Joi.string()
    .valid("completed", "yet_to_start", "in_progress", "skipped", "cancelled")
    .allow(null)
    .optional(),
  link_to_user: Joi.string().uuid().allow(null).optional(),
});

// --- Delete ---

export const deleteActionParamsSchema = Joi.object({
  action_id: Joi.string().uuid().required().messages({
    "string.guid": "Action ID must be a valid UUID",
    "any.required": "Action ID is required",
  }),
});

export default {
  createActionParamsSchema,
  createActionBodySchema,
  getActionsParamsSchema,
  getActionsQuerySchema,
  updateActionParamsSchema,
  updateActionBodySchema,
  deleteActionParamsSchema,
};
