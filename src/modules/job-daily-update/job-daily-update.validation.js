import Joi from "joi";

// DATEONLY values stay as the "YYYY-MM-DD" string the client sent. Letting Joi
// turn them into Date objects would put them at UTC midnight, and a server east
// or west of UTC would then store the neighbouring day.
const isoDay = () => Joi.date().iso().raw();

const TEXT_MAX = 5000;
const TITLE_MAX = 150;

/** How the work on an update stands; shown as the row's badge. */
export const DAILY_UPDATE_STATUSES = ["in_progress", "completed", "delayed"];

const title = () =>
  Joi.string().trim().max(TITLE_MAX).allow("", null).optional().messages({
    "string.max": `Title must be at most ${TITLE_MAX} characters`,
  });

const status = () =>
  Joi.string().valid(...DAILY_UPDATE_STATUSES).optional().messages({
    "any.only": `Status must be one of ${DAILY_UPDATE_STATUSES.join(", ")}`,
  });

const TEMPERATURE_MIN = -50;
const TEMPERATURE_MAX = 60;

// °C, one decimal place. Multipart sends "" to clear it.
const temperature = () =>
  Joi.number().min(TEMPERATURE_MIN).max(TEMPERATURE_MAX).precision(1).allow("", null).optional().messages({
    "number.base": "Temperature must be a number",
    "number.min": `Temperature must be at least ${TEMPERATURE_MIN}°C`,
    "number.max": `Temperature must be at most ${TEMPERATURE_MAX}°C`,
  });

export const jobIdParamsSchema = Joi.object({
  job_id: Joi.string().uuid().required().messages({
    "string.guid": "Job ID must be a valid UUID",
    "any.required": "Job ID is required",
  }),
});

export const dailyUpdateParamsSchema = Joi.object({
  job_daily_update_id: Joi.string().uuid().required().messages({
    "string.guid": "Daily update ID must be a valid UUID",
    "any.required": "Daily update ID is required",
  }),
});

// Multipart body. camelToSnakeMiddleware copies the first uploaded file's S3
// location onto `images`, so the key is accepted and dropped — the files
// themselves are read from req.files.
export const createDailyUpdateBodySchema = Joi.object({
  update_date: isoDay().required().messages({
    "date.format": "Update date must be a valid date (YYYY-MM-DD)",
    "any.required": "Update date is required",
  }),
  title: title(),
  status: status(),
  work_completed: Joi.string().trim().min(1).max(TEXT_MAX).required().messages({
    "string.empty": "Work completed is required",
    "string.max": `Work completed must be at most ${TEXT_MAX} characters`,
    "any.required": "Work completed is required",
  }),
  notes: Joi.string().trim().max(TEXT_MAX).allow("", null).optional().messages({
    "string.max": `Notes must be at most ${TEXT_MAX} characters`,
  }),
  temperature: temperature(),
  images: Joi.any().strip(),
});

export const updateDailyUpdateBodySchema = Joi.object({
  update_date: isoDay().optional().messages({
    "date.format": "Update date must be a valid date (YYYY-MM-DD)",
  }),
  title: title(),
  status: status(),
  work_completed: Joi.string().trim().min(1).max(TEXT_MAX).optional().messages({
    "string.empty": "Work completed cannot be empty",
    "string.max": `Work completed must be at most ${TEXT_MAX} characters`,
  }),
  notes: Joi.string().trim().max(TEXT_MAX).allow("", null).optional().messages({
    "string.max": `Notes must be at most ${TEXT_MAX} characters`,
  }),
  temperature: temperature(),
  // Repeated multipart field; one value arrives as a plain string.
  remove_image_ids: Joi.array().items(Joi.string().uuid()).single().optional().messages({
    "string.guid": "Photo IDs to remove must be valid UUIDs",
  }),
  images: Joi.any().strip(),
});

export const listDailyUpdatesQuerySchema = Joi.object({
  from: isoDay().optional(),
  to: isoDay().optional(),
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(100).optional(),
});

export const myDailyUpdatesQuerySchema = Joi.object({
  job_id: Joi.string().uuid().optional().messages({
    "string.guid": "Job ID must be a valid UUID",
  }),
  from: isoDay().required().messages({
    "any.required": "From date is required",
  }),
  to: isoDay().required().messages({
    "any.required": "To date is required",
  }),
});

export default {
  jobIdParamsSchema,
  dailyUpdateParamsSchema,
  createDailyUpdateBodySchema,
  updateDailyUpdateBodySchema,
  listDailyUpdatesQuerySchema,
  myDailyUpdatesQuerySchema,
};
