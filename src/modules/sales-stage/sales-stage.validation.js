import Joi from "joi";

export const createSalesStageSchema = Joi.object({
  sales_process_id: Joi.string().uuid().required().messages({
    "any.required": "Sales process ID is required",
    "string.guid": "Sales process ID must be a valid UUID",
  }),

  stage_name: Joi.string().max(150).required().messages({
    "any.required": "Stage name is required",
  }),

  functionality_id: Joi.array()
    .items(Joi.string().guid())
    .optional()
    .messages({
      "string.guid": "functionality id must be a valid UUID",
    }),

  category: Joi.string()
    .valid("lead", "opportunity")
    .max(50)
    .required()
    .messages({
      "any.only": "Category must be 'lead' or 'opportunity'",
    }),

  sort_order: Joi.number().integer().default(1).min(1).optional(),

  is_active: Joi.boolean().optional(),
});

export const deleteSalesStageSchema = Joi.object({
  sales_stage_id: Joi.string().uuid().required().messages({
    "any.required": "Sales stage ID is required",
    "string.guid": "Sales stage ID must be a valid UUID",
  }),
});

export const updateSalesStageIdParamsSchema = Joi.object({
  sales_stage_id: Joi.string().uuid().required().messages({
    "any.required": "Sales stage ID is required",
    "string.guid": "Sales stage ID must be a valid UUID",
  }),
});

export const updateSalesStageSchema = Joi.object({
  stage_name: Joi.string().max(150).optional().messages({}),

  functionality_id: Joi.array()
    .items(Joi.string().guid())
    .optional()
    .messages({
      "string.guid": "functionality id must be a valid UUID",
    }),

  category: Joi.string()
    .max(50)
    .valid("lead", "opportunity")
    .optional()
    .messages({
      "any.only": "Category must be 'lead' or 'opportunity'",
    }),

  sort_order: Joi.number().integer().default(1).min(1).optional(),
});

export const updateSalesStageIsActiveSchema = Joi.object({
  is_active: Joi.boolean().required(),
});

export const getSalesStageBySalesProcessIdSchema = Joi.object({
  sales_process_id: Joi.string().uuid().required().messages({
    "any.required": "Sales process ID is required",
    "string.guid": "Sales process ID must be a valid UUID",
  }),
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

export default {
  createSalesStageSchema,
  getSalesStageBySalesProcessIdSchema,
  deleteSalesStageSchema,
  updateSalesStageIdParamsSchema,
  updateSalesStageSchema,
  updateSalesStageIsActiveSchema,
};
