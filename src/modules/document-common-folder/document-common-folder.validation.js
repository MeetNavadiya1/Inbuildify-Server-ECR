import Joi from "joi";

export const createDocumentCommonFolderSchema = Joi.object({
  name: Joi.string().min(1).max(150).required(),
  sort_order: Joi.number().integer().min(1).optional(),
  notify: Joi.boolean().optional(),
  share_to_customer: Joi.boolean().optional(),
  is_locked: Joi.boolean().optional(),
  role_ids: Joi.array().items(Joi.string().uuid()).optional().messages({
    "string.guid": "role ID must be a valid UUID",
  }),
  user_ids: Joi.array().items(Joi.string().uuid()).optional().messages({
    "string.guid": "user ID must be a valid UUID",
  }),
});

export const getAllDocumentCommonFolderSchema = Joi.object({
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

export const deleteDocumentCommonFolderSchema = Joi.object({
  document_common_folder_id: Joi.string().uuid().required().messages({
    "string.guid": "Surveyor ID must be a valid UUID",
    "any.required": "Surveyor ID is required",
  }),
});

export const updateDocumentCommonFolderParamsSchema = Joi.object({
  document_common_folder_id: Joi.string().uuid().required().messages({
    "string.guid": "Surveyor ID must be a valid UUID",
    "any.required": "Surveyor ID is required",
  }),
});

export const updateDocumentCommonFolderSchema = Joi.object({
  name: Joi.string().min(1).max(150).optional(),
  sort_order: Joi.number().integer().min(1).optional(),
  notify: Joi.boolean().optional(),
  share_to_customer: Joi.boolean().optional(),
  is_locked: Joi.boolean().optional(),
  role_ids: Joi.array().items(Joi.string().uuid()).optional().messages({
    "string.guid": "role ID must be a valid UUID",
  }),
  user_ids: Joi.array().items(Joi.string().uuid()).optional().messages({
    "string.guid": "user ID must be a valid UUID",
  }),
});

export default {
  createDocumentCommonFolderSchema,
  getAllDocumentCommonFolderSchema,
  deleteDocumentCommonFolderSchema,
  updateDocumentCommonFolderParamsSchema,
  updateDocumentCommonFolderSchema,
};
