import Joi from "joi";

export const createJobColorColumnSectionSchema = Joi.object({
  section_name: Joi.string()
    .trim()
    .max(100)
    .valid("attach_pdf_beginning", "attach_pdf_end")
    .required()
    .messages({
      "string.empty": "Section name is required",
      "any.only":
        "Section name must be either 'attach_pdf_beginning' or 'attach_pdf_end'",
      "any.required": "Section name is required",
    }),
  attachments: Joi.string().max(500).allow(null, "").optional(),
  image: Joi.string().max(500).allow(null, "").optional(),
  sort_order: Joi.number().integer().min(1).default(1).optional().messages({
    "number.base": "Sort order must be a number",
    "number.integer": "Sort order must be an integer",
    "number.min": "Sort order must be at least 1",
  }),
});

export const getJobColorColumnSectionsSchema = Joi.object({
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

export const deleteJobColorColumnSectionSchema = Joi.object({
  job_color_column_section_id: Joi.string().uuid().required().messages({
    "string.guid": "Job color column section ID must be a valid UUID",
    "any.required": "job color column section ID is required",
  }),
});

export const updateJobColorColumnSectionParamsSchema = Joi.object({
  job_color_column_section_id: Joi.string().uuid().required().messages({
    "string.guid": "Job color column section ID must be a valid UUID",
    "any.required": "job color column section ID is required",
  }),
});

export const updateJobColorColumnSectionSchema = Joi.object({
  section_name: Joi.string()
    .trim()
    .max(100)
    .valid("attach_pdf_beginning", "attach_pdf_end")
    .optional()
    .messages({
      "any.only":
        "Section name must be either 'attach_pdf_beginning' or 'attach_pdf_end'",
    }),
  attachments: Joi.string().max(500).allow(null, "").optional(),
  image: Joi.string().max(500).allow(null, "").optional(),
  sort_order: Joi.number().integer().min(1).optional().messages({
    "number.base": "Sort order must be a number",
    "number.integer": "Sort order must be an integer",
    "number.min": "Sort order must be at least 1",
  }),
})
  .min(1)
  .messages({
    "object.min": "At least one field must be provided for update",
  });

export default {
  createJobColorColumnSectionSchema,
  getJobColorColumnSectionsSchema,
  deleteJobColorColumnSectionSchema,
  updateJobColorColumnSectionParamsSchema,
  updateJobColorColumnSectionSchema,
};
