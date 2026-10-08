import Joi from "joi";

const MAINTENANCE_STATUSES = ["readyformaintenance", "undermaintenance", "completed"];
const REQUEST_STATUSES = ["Pending", "On Hold", "Completed"];

export const getMaintenanceByIdSchema = Joi.object({
  maintenance_id: Joi.string().uuid().required().messages({
    "string.guid": "Maintenance ID must be a valid UUID",
    "any.required": "Maintenance ID is required",
  }),
});

export const getAllMaintenanceQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(25),
  status: Joi.string().valid(...MAINTENANCE_STATUSES).optional(),
  customer_name: Joi.string().max(255).optional().allow(""),
  job_address: Joi.string().max(255).optional().allow(""),
  reference_id: Joi.string().max(100).optional().allow(""),
  supervisor_id: Joi.string().uuid().optional(),
  pci_date_from: Joi.date().optional(),
  pci_date_to: Joi.date().optional(),
  handover_date_from: Joi.date().optional(),
  handover_date_to: Joi.date().optional(),
  sort_by: Joi.string().valid("created_at", "start_date", "end_date", "status").optional(),
  sort_order: Joi.string().valid("asc", "desc").optional(),
});

export const updateMaintenanceStatusSchema = Joi.object({
  status: Joi.string().valid(...MAINTENANCE_STATUSES).required().messages({
    "any.only": `Status must be one of: ${MAINTENANCE_STATUSES.join(", ")}`,
    "any.required": "Status is required",
  }),
  comments: Joi.string().max(1000).optional().allow(null, ""),
});

export const assignSupervisorSchema = Joi.object({
  supervisor_id: Joi.string().uuid().required().messages({
    "string.guid": "Supervisor ID must be a valid UUID",
    "any.required": "Supervisor ID is required",
  }),
});

export const createRequestSchema = Joi.object({
  supplier: Joi.string().max(255).optional().allow(null, ""),
  start_date: Joi.date().optional().allow(null),
  finish_date: Joi.date().optional().allow(null),
  amount: Joi.number().precision(2).optional().allow(null),
  notes: Joi.string().max(2000).optional().allow(null, ""),
  attach_file: Joi.string().max(500).optional().allow(null, ""),
  descriptions: Joi.array().items(Joi.string().max(500)).min(1).required().messages({
    "array.min": "At least one task description is required",
    "any.required": "At least one task description is required",
  }),
});

export const updateRequestSchema = Joi.object({
  supplier: Joi.string().max(255).optional().allow(null, ""),
  start_date: Joi.date().optional().allow(null),
  finish_date: Joi.date().optional().allow(null),
  complete_date: Joi.date().optional().allow(null),
  amount: Joi.number().precision(2).optional().allow(null),
  notes: Joi.string().max(2000).optional().allow(null, ""),
  attach_file: Joi.string().max(500).optional().allow(null, ""),
  status: Joi.string().valid(...REQUEST_STATUSES).optional(),
})
  .min(1)
  .messages({ "object.min": "At least one field must be provided for update" });

export const requestIdParamSchema = Joi.object({
  request_id: Joi.string().uuid().required(),
});

export const taskIdParamSchema = Joi.object({
  task_id: Joi.string().uuid().required(),
});

export const addTaskSchema = Joi.object({
  title: Joi.string().max(500).required(),
  notes: Joi.string().max(2000).optional().allow(null, ""),
});

export const updateTaskSchema = Joi.object({
  title: Joi.string().max(500).optional(),
  notes: Joi.string().max(2000).optional().allow(null, ""),
  is_completed: Joi.boolean().optional(),
  file: Joi.any().optional(),
  image: Joi.any().optional(),
})
  .min(1)
  .messages({ "object.min": "At least one field must be provided for update" });

export const notifySchema = Joi.object({
  notify_stage: Joi.string().valid("Start", "Completed").required(),
  task_status_filter: Joi.string().valid("All", "Pending", "Completed").default("All"),
  request_ids: Joi.array().items(Joi.string()).default([]),
  to: Joi.alternatives().try(Joi.string(), Joi.array().items(Joi.string())).required(),
  subject: Joi.string().required(),
  message: Joi.string().allow(null, "").optional(),
});

export const bookingReminderSchema = Joi.object({
  filter: Joi.string().valid("All", "Pending", "Accepted").required(),
});

export default {
  getMaintenanceByIdSchema,
  getAllMaintenanceQuerySchema,
  updateMaintenanceStatusSchema,
  assignSupervisorSchema,
  createRequestSchema,
  updateRequestSchema,
  requestIdParamSchema,
  taskIdParamSchema,
  addTaskSchema,
  updateTaskSchema,
  notifySchema,
  bookingReminderSchema,
};
