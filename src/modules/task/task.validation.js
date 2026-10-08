import Joi from "joi";
import { NAME_PATTERN, NAME_PATTERN_MESSAGE } from "../../utils/validationPatterns.js";

export const createTaskSchema = Joi.object({
  name: Joi.string()
    .min(2)
    .max(200)
    .pattern(NAME_PATTERN)
    .required(),

  description: Joi.string().allow(null, "").optional(),

  due_date: Joi.date()
    .allow(null)
    .custom((value, helpers) => {
      if (!value) {
        return value;
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Start of today
      if (value < today) {
        return helpers.message("Due date must be today or a future date");
      }
      return value;
    })
    .messages({
      "date.base": "Due date must be a valid date",
    }),

  due_time: Joi.string()
    .pattern(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/) // HH:mm or HH:mm:ss
    .allow(null, "")
    .optional()
    .messages({
      "string.pattern.base":
        "Due time must be in HH:MM format OR due time must be valid",
    }),

  assignee_id: Joi.alternatives()
    .try(
      Joi.string().uuid(),
      Joi.string().pattern(
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}(,[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})*$/,
      ),
    )
    .allow(null)
    .optional(),

  lead_id: Joi.string().uuid().allow(null).optional().messages({
    "string.uuid": "Lead ID must be a valid UUID",
  }),
  job_id: Joi.string().uuid().allow(null).optional().messages({
    "string.uuid": "Job ID must be a valid UUID",
  }),

  priority: Joi.string()
    .max(20)
    .valid("Low", "Medium", "High")
    .default("Medium"),

  status: Joi.string()
    .max(20)
    .valid("Yet to Start", "In Progress", "Completed", "Cancelled", "Skipped")
    .default("Yet to Start"),

  attach_files: Joi.string().max(500).allow(null, "").optional(),

  link_to: Joi.string().uuid().allow(null).optional().messages({
    "string.uuid": "Link to must be a valid UUID",
  }),

  link_type: Joi.string().max(255).allow(null, "").optional(),
});

export const getAllTaskSchema = Joi.object({
  name: Joi.string().max(200).optional(),

  due_date_from: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .messages({ "string.pattern.base": "due_date_from must be YYYY-MM-DD" }),

  due_date_to: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .messages({ "string.pattern.base": "due_date_to must be YYYY-MM-DD" }),

  due_date: Joi.date()
    .allow(null)
    .custom((value, helpers) => {
      if (!value) {
        return value;
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Start of today
      if (value < today) {
        return helpers.message("Due date must be today or a future date");
      }
      return value;
    })
    .messages({
      "date.base": "Due date must be a valid date",
    })
    .optional(),

  assignee_id: Joi.alternatives()
    .try(
      Joi.string().uuid(),
      Joi.string().pattern(
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}(,[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})*$/,
      ),
      Joi.array().items(Joi.string().uuid()),
    )
    .allow(null)
    .optional(),

  link_to: Joi.string().uuid().allow(null).optional().messages({
    "string.uuid": "Link to must be a valid UUID",
  }),

  link_type: Joi.string().max(255).allow(null, "").optional(),

  lead_id: Joi.string().uuid().allow(null).optional().messages({
    "string.uuid": "Lead ID must be a valid UUID",
  }),
  job_id: Joi.string().uuid().allow(null).optional().messages({
    "string.uuid": "Job ID must be a valid UUID",
  }),

  priority: Joi.string().max(20).valid("Low", "Medium", "High").optional(),

  status: Joi.string()
    .max(20)
    .valid("Yet to Start", "In Progress", "Completed", "Cancelled", "Skipped")
    .optional(),

  date_filter: Joi.string()
    .valid("today", "tomorrow", "this_week", "next_week", "overdue", "pending")
    .optional(),

  sort_by: Joi.string()
    .valid("name", "due_date", "priority", "status", "created_at")
    .optional(),

  sort_order: Joi.string()
    .valid("asc", "desc", "ASC", "DESC")
    .optional(),

  page: Joi.number().integer().min(1).default(1).messages({
    "number.base": "Page must be a number",
    "number.integer": "Page must be an integer",
    "number.min": "Page must be greater than 0",
  }),

  limit: Joi.number().integer().min(1).max(100).default(10).messages({
    "number.base": "Limit must be a number",
    "number.integer": "Limit must be an integer",
    "number.min": "Limit must be at least 1",
    "number.max": "Limit must not exceed 100",
  }),
  is_deleted: Joi.boolean().optional(),
});

export const deleteTaskSchema = Joi.object({
  task_id: Joi.string().uuid().required().messages({
    "string.guid": "task ID must be a valid UUID",
    "any.required": "task ID is required",
  }),
});

export const updateTaskParamsSchema = Joi.object({
  task_id: Joi.string().uuid().required().messages({
    "string.guid": "task ID must be a valid UUID",
    "any.required": "task ID is required",
  }),
});

export const updateTaskSchema = Joi.object({
  name: Joi.string()
    .min(2)
    .max(200)
    .pattern(NAME_PATTERN)
    .optional(),

  description: Joi.string().allow(null, "").optional(),

  due_date: Joi.date()
    .allow(null)
    .custom((value, helpers) => {
      if (!value) {
        return value;
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Start of today
      if (value < today) {
        return helpers.message("Due date must be today or a future date");
      }
      return value;
    })
    .messages({
      "date.base": "Due date must be a valid date",
    })
    .optional(),

  due_time: Joi.string()
    .pattern(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/) // HH:mm or HH:mm:ss
    .allow(null, "")
    .optional()
    .messages({
      "string.pattern.base":
        "Due time must be in HH:MM format OR due time must be valid",
    }),

  assignee_id: Joi.string().uuid().allow(null).optional(),


  priority: Joi.string().max(20).valid("Low", "Medium", "High").optional(),

  status: Joi.string()
    .max(20)
    .valid("Yet to Start", "In Progress", "Completed", "Cancelled", "Skipped")
    .optional(),

  attach_files: Joi.string().max(500).allow(null, "").optional(),

  link_to: Joi.string().uuid().allow(null).optional().messages({
    "string.uuid": "Link to must be a valid UUID",
  }),

  link_type: Joi.string().max(255).allow(null, "").optional(),
});

export default {
  createTaskSchema,
  getAllTaskSchema,
  deleteTaskSchema,
  updateTaskParamsSchema,
  updateTaskSchema,
};
