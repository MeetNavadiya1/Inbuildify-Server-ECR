import Joi from "joi";

export const createJobVariationApprovalSchema = Joi.object({
  role_id: Joi.string().uuid().required().messages({
    "string.guid": "Role ID must be a valid UUID",
    "any.required": "Role ID is required",
  }),
  amount: Joi.number().precision(2).positive().required().messages({
    "number.base": "Amount must be a number",
    "number.positive": "Amount must be a positive number",
    "any.required": "Amount is required",
  }),
});

export const getJobVariationApprovalsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1).messages({
    "number.base": "Page must be a number",
    "number.integer": "Page must be an integer",
    "number.min": "Page must be at least 1",
  }),
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(25)
    .optional()
    .messages({
      "number.base": "Limit must be a number",
      "number.integer": "Limit must be an integer",
      "number.min": "Limit must be at least 1",
      "number.max": "Limit must not exceed 100",
    }),
});

export const deleteJobVariationApprovalSchema = Joi.object({
  id: Joi.string().uuid().required().messages({
    "string.guid": "Job variation approval ID must be a valid UUID",
    "any.required": "Job variation approval ID is required",
  }),
});

export const updateJobVariationApprovalSchema = Joi.object({
  role_id: Joi.string().uuid().optional().messages({
    "string.guid": "Role ID must be a valid UUID",
  }),
  amount: Joi.number().precision(2).positive().optional().messages({
    "number.base": "Amount must be a number",
    "number.positive": "Amount must be a positive number",
  }),
})
  .min(1)
  .messages({
    "object.min": "At least one field must be provided for update",
  });

export const updateJobVariationApprovalParamsSchema = Joi.object({
  id: Joi.string().uuid().required().messages({
    "string.guid": "Job variation approval ID must be a valid UUID",
    "any.required": "Job variation approval ID is required",
  }),
});

export default {
  createJobVariationApprovalSchema,
  getJobVariationApprovalsSchema,
  deleteJobVariationApprovalSchema,
  updateJobVariationApprovalSchema,
  updateJobVariationApprovalParamsSchema,
};
