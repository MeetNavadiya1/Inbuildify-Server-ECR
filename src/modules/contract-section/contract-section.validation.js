import Joi from "joi";

export const createContractSectionSchema = Joi.object({
  contract_format_id: Joi.string().uuid().required().messages({
    "string.guid": "contract_format_id must be a valid UUID.",
    "any.required": "contract_format_id is required.",
  }),
  section_name: Joi.string()
    .min(1)
    .max(255)
    .required()
    .valid("attach_pdf")
    .messages({
      "string.empty": "section_name cannot be empty.",
      "string.max": "section_name cannot exceed 255 characters.",
      "any.required": "section_name is required.",
    }),
  sort_order: Joi.number().integer().min(1).optional().messages({
    "number.base": "sort_order must be a number.",
    "number.integer": "sort_order must be an integer.",
    "number.min": "sort_order must be at least 1.",
  }),
  section_url: Joi.alternatives()
    .try(
      Joi.string().uri().optional().allow(null).messages({
        "string.uri": "section_url must be a valid URL.",
      }),
      Joi.any().optional().allow(null),
    )
    .optional(),
});

export const getAllContractSectionsSchema = Joi.object({
  page: Joi.number().integer().min(1).optional().default(1).messages({
    "number.base": "page must be a number.",
    "number.integer": "page must be an integer.",
    "number.min": "page must be at least 1.",
  }),
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .optional()
    .default(25)
    .messages({
      "number.base": "limit must be a number.",
      "number.integer": "limit must be an integer.",
      "number.min": "limit must be at least 1.",
      "number.max": "limit cannot exceed 100.",
    }),
  contract_format_id: Joi.string().uuid().optional().messages({
    "string.guid": "contract_format_id must be a valid UUID.",
  }),
  section_name: Joi.string().optional().messages({
    "string.base": "section_name must be a string.",
  }),
});

export const getContractSectionByIdSchema = Joi.object({
  contract_section_id: Joi.string().uuid().required().messages({
    "string.guid": "contract_section_id must be a valid UUID.",
    "any.required": "contract_section_id is required.",
  }),
});

export const updateContractSectionParamsSchema = Joi.object({
  contract_section_id: Joi.string().uuid().required().messages({
    "string.guid": "contract_section_id must be a valid UUID.",
    "any.required": "contract_section_id is required.",
  }),
});

export const updateContractSectionSchema = Joi.object({
  section_name: Joi.string()
    .min(1)
    .max(255)
    .optional()
    .valid("attach_pdf")
    .messages({
      "string.empty": "section_name cannot be empty.",
      "string.max": "section_name cannot exceed 255 characters.",
    }),
  sort_order: Joi.number().integer().min(1).optional().messages({
    "number.base": "sort_order must be a number.",
    "number.integer": "sort_order must be an integer.",
    "number.min": "sort_order must be at least 1.",
  }),
  section_url: Joi.alternatives()
    .try(
      Joi.string().uri().optional().allow(null).messages({
        "string.uri": "section_url must be a valid URL.",
      }),
      Joi.any().optional().allow(null),
    )
    .optional(),
})
  .min(1)
  .messages({
    "object.min": "At least one field must be provided for update.",
  });

export const deleteContractSectionSchema = Joi.object({
  contract_section_id: Joi.string().uuid().required().messages({
    "string.guid": "contract_section_id must be a valid UUID.",
    "any.required": "contract_section_id is required.",
  }),
});

export default {
  createContractSectionSchema,
  getAllContractSectionsSchema,
  getContractSectionByIdSchema,
  updateContractSectionParamsSchema,
  updateContractSectionSchema,
  deleteContractSectionSchema,
};
