import Joi from "joi";

export const createHolidaySchema = Joi.object({
  state: Joi.array()
    .items(Joi.string().guid({ version: "uuidv4" }))
    .optional()
    .messages({
      "string.guid": "state id must be a valid UUID",
    }),
  holiday_start_date: Joi.date().required().messages({
    "any.required": "Please select start date first",
  }),
  holiday_end_date: Joi.date()
    .required()
    .messages({
      "any.required": "Holiday end date is required",
    })
    .when("holiday_start_date", {
      is: Joi.exist(),
      then: Joi.date().min(Joi.ref("holiday_start_date")).messages({
        "date.min": "Holiday end date must be after or equal to holiday start date",
      }),
      otherwise: Joi.any().forbidden().messages({
        "any.unknown": "Please select start date first",
      }),
    }),
  holiday_description: Joi.string()
    .trim()
    .min(2)
    .max(500)
    .pattern(/^[^<>]*$/)
    .optional(),
});

export const getAllHolidaySchema = Joi.object({
  state: Joi.string()
    .custom((value, helpers) => {
      const parts = value.split(",").map((v) => v.trim());

      for (const id of parts) {
        if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
          return helpers.error("string.guid");
        }
      }

      return value;
    })
    .messages({
      "string.guid": "Each state id must be a valid UUID.",
      "string.base": "state must be comma-separated UUID string.",
    })
    .optional(),
  holiday_start_date: Joi.date().optional(),
  holiday_end_date: Joi.date().optional(),
  holiday_description: Joi.string().trim().max(500).optional(),
  year: Joi.number().integer().min(1900).max(2100).optional().messages({
    "number.base": "Year must be a number",
    "number.integer": "Year must be an integer",
    "number.min": "Year must be greater than or equal to 1900",
    "number.max": "Year must be less than or equal to 2100",
  }),

  status: Joi.boolean().default(true),
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
});

export const deleteHolidaySchema = Joi.object({
  id: Joi.string().uuid().required().messages({
    "string.guid": "holiday ID must be a valid UUID",
    "any.required": "holiday ID is required",
  }),
});

export const updateHolidayParamsSchema = Joi.object({
  holiday_id: Joi.string().uuid().required().messages({
    "string.guid": "holiday ID must be a valid UUID",
    "any.required": "holiday ID is required",
  }),
});

export const updateHolidaySchema = Joi.object({
  state: Joi.array()
    .items(Joi.string().guid({ version: "uuidv4" }))
    .optional()
    .messages({
      "string.guid": "state id must be a valid UUID",
    }),
  holiday_start_date: Joi.date().optional(),
  holiday_end_date: Joi.date()
    .optional()
    .when("holiday_start_date", {
      is: Joi.exist(),
      then: Joi.date().min(Joi.ref("holiday_start_date")).messages({
        "date.min": "Holiday end date must be after or equal to holiday start date",
      }),
      otherwise: Joi.any().forbidden().messages({
        "any.unknown": "Please select start date first",
      }),
    }),
  holiday_description: Joi.string()
    .trim()
    .min(2)
    .max(500)
    .pattern(/^[^<>]*$/)
    .optional(),
  status: Joi.boolean().optional(),
});

export default {
  createHolidaySchema,
  getAllHolidaySchema,
  deleteHolidaySchema,
  updateHolidayParamsSchema,
  updateHolidaySchema,
};
