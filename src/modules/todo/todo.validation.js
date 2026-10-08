import Joi from "joi";

// A to-do runs Booking → Start → Finish. Anything else is a data-entry slip,
// so the three dates are ordered here rather than left to the client.
export const TODO_STATUSES = ["Pending", "Confirmed", "Cancelled", "Completed"];

// Statuses that close a to-do. Closed to-dos drop out of the Today / Tomorrow /
// week / Overdue buckets — a finished job is not overdue.
export const TODO_CLOSED_STATUSES = ["Cancelled", "Completed"];

export const createTodoSchema = Joi.object({
  job_id: Joi.string().uuid().allow(null, "").optional(),
  task_name: Joi.string().min(1).max(255).required(),
  supplier_id: Joi.string().uuid().required(),
  // Ordering is enforced by validateTodoDateSequence, not by Joi refs: a ref
  // whose target key is simply absent (e.g. only finish_date supplied) fails
  // with "must have a valid date format" and would reject a legitimate to-do.
  booking_date: Joi.date().allow(null).optional(),
  start_date: Joi.date().allow(null).optional(),
  finish_date: Joi.date().allow(null).optional(),
  site_supervisor_id: Joi.string().uuid().allow(null, "").optional(),
  subject: Joi.string().max(500).allow(null, "").optional(),
  message: Joi.string().allow(null, "").optional(),
  status: Joi.string().valid(...TODO_STATUSES).default("Pending"),
});

export const getAllTodosSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(25),
  task_name: Joi.string().max(255).optional(),
  job_address: Joi.string().max(500).optional(),
  site_supervisor_id: Joi.string().uuid().optional(),
  supplier_id: Joi.alternatives()
    .try(
      Joi.string().uuid(),
      Joi.string().pattern(
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}(,[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})*$/,
      ),
      Joi.array().items(Joi.string().uuid()),
    )
    .optional(),
  booking_date_from: Joi.date().allow(null).optional(),
  booking_date_to: Joi.date().allow(null).optional(),
  start_date_from: Joi.date().allow(null).optional(),
  start_date_to: Joi.date().allow(null).optional(),
  status: Joi.string().valid(...TODO_STATUSES).optional(),
  date_filter: Joi.string()
    .valid("today", "tomorrow", "this_week", "next_week", "overdue")
    .optional(),
});

export const todoIdParamSchema = Joi.object({
  todo_id: Joi.string().uuid().required().messages({
    "string.guid": "Todo ID must be a valid UUID",
    "any.required": "Todo ID is required",
  }),
});

// As with create, ordering is checked in the controller — a PUT may send only
// one of the three dates, so the order can only be judged after merging the
// payload over the stored row.
export const updateTodoSchema = Joi.object({
  job_id: Joi.string().uuid().allow(null, "").optional(),
  task_name: Joi.string().min(1).max(255).optional(),
  supplier_id: Joi.string().uuid().allow(null, "").optional(),
  booking_date: Joi.date().allow(null).optional(),
  start_date: Joi.date().allow(null).optional(),
  finish_date: Joi.date().allow(null).optional(),
  site_supervisor_id: Joi.string().uuid().allow(null, "").optional(),
  subject: Joi.string().max(500).allow(null, "").optional(),
  message: Joi.string().allow(null, "").optional(),
  status: Joi.string().valid(...TODO_STATUSES).optional(),
});

/**
 * Booking → Start → Finish must be non-decreasing. Any date may be absent; a
 * missing date simply drops out of the comparison rather than blocking the
 * save, so a to-do with only a finish date is still valid.
 *
 * @returns {string|null} the error message, or null when the dates are in order
 */
export function validateTodoDateSequence({ booking_date, start_date, finish_date }) {
  const parse = (value) => {
    if (value === null || value === undefined || value === "") {
      return null;
    }
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const booking = parse(booking_date);
  const start = parse(start_date);
  const finish = parse(finish_date);

  if (booking && start && start < booking) {
    return "Start date cannot be before the booking date";
  }
  if (start && finish && finish < start) {
    return "Finish date cannot be before the start date";
  }
  if (booking && finish && finish < booking) {
    return "Finish date cannot be before the booking date";
  }
  return null;
}

export default {
  createTodoSchema,
  getAllTodosSchema,
  todoIdParamSchema,
  updateTodoSchema,
  validateTodoDateSequence,
  TODO_STATUSES,
  TODO_CLOSED_STATUSES,
};
