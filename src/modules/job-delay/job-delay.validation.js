import Joi from "joi";

export const createJobDelaySchema = {
  params: Joi.object({
    job_id: Joi.string().uuid().required().messages({
      "string.guid": "Job ID must be a valid UUID",
      "any.required": "Job ID is required",
    }),
  }),
  body: Joi.object({
    reason: Joi.string()
      .valid("Private Inspection", "Materials", "Weather", "Variation", "Permits", "Others")
      .required()
      .messages({
        "any.only": "Reason must be one of: Private Inspection, Materials, Weather, Variation, Permits, Others",
        "any.required": "Reason is required",
      }),
    no_of_days: Joi.number().integer().min(1).required().messages({
      "number.base": "Number of days must be a number",
      "number.integer": "Number of days must be an integer",
      "number.min": "Number of days must be at least 1",
      "any.required": "Number of days is required",
    }),
    from_date: Joi.date().iso().required().messages({
      "date.format": "From date must be a valid ISO date",
      "any.required": "From date is required",
    }),
    to_date: Joi.date().iso().min(Joi.ref("from_date")).required().messages({
      "date.format": "To date must be a valid ISO date",
      "date.min": "To date must be after or equal to from date",
      "any.required": "To date is required",
    }),
    send_mail: Joi.boolean().optional().default(false),
  }),
};

export const jobDelayParamsSchema = Joi.object({
  job_delay_id: Joi.string().uuid().required().messages({
    "string.guid": "Job delay ID must be a valid UUID",
    "any.required": "Job delay ID is required",
  }),
});

export const updateJobDelaySchema = {
  params: jobDelayParamsSchema,
  body: Joi.object({
    reason: Joi.string()
      .valid("Private Inspection", "Materials", "Weather", "Variation", "Permits", "Others")
      .optional()
      .messages({
        "any.only": "Reason must be one of: Private Inspection, Materials, Weather, Variation, Permits, Others",
      }),
    no_of_days: Joi.number().integer().min(1).optional().messages({
      "number.base": "Number of days must be a number",
      "number.integer": "Number of days must be an integer",
      "number.min": "Number of days must be at least 1",
    }),
    from_date: Joi.date().iso().optional().messages({
      "date.format": "From date must be a valid ISO date",
    }),
    to_date: Joi.date().iso().min(Joi.ref("from_date")).optional().messages({
      "date.format": "To date must be a valid ISO date",
      "date.min": "To date must be after or equal to from date",
    }),
    send_mail: Joi.boolean().optional(),
  }),
};

export default {
  createJobDelaySchema,
  jobDelayParamsSchema,
  updateJobDelaySchema,
};
