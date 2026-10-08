import Joi from "joi";

export const createDocumentCommonSubfolderSchem = Joi.object({
  document_common_folder_id: Joi.string().uuid().optional().messages({
    "string.guid": "Document common folder ID must be a valid UUID",
    "any.required": "Document common folder ID is required",
  }),

  parent_subfolder_id: Joi.string().uuid().optional().allow(null).messages({
    "string.guid": "Parent subfolder ID must be a valid UUID",
  }),

  name: Joi.string().trim().min(1).max(150).required().messages({
    "string.base": "Name must be a string.",
    "string.max": "Name cannot exceed 150 characters.",
  }),
  sort_order: Joi.number().integer().min(1).optional(),
});

export const getDocumentCommonSubfolderByFolderIdParamsSchema = Joi.object({
  document_common_folder_id: Joi.string().uuid().required().messages({
    "string.guid": "Document common folder ID must be a valid UUID",
    "any.required": "Document common folder ID is required",
  }),
});

export const getDocumentCommonSubfolderByFolderIdSchema = Joi.object({
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

export const deleteDocumentCommonSubfolderSchema = Joi.object({
  document_common_subfolder_id: Joi.string().uuid().required().messages({
    "string.guid": "Document common subfolder ID must be a valid UUID",
    "any.required": "Document common subfolder ID is required",
  }),
});

export const updateDocumentCommonSubfolderParamsSchema = Joi.object({
  document_common_subfolder_id: Joi.string().uuid().required().messages({
    "string.guid": "Document common subfolder ID must be a valid UUID",
    "any.required": "Document common subfolder ID is required",
  }),
});

export const updateDocumentCommonSubfolderSchema = Joi.object({
  name: Joi.string().trim().min(1).max(150).optional().messages({
    "string.base": "Name must be a string.",
    "string.max": "Name cannot exceed 150 characters.",
  }),
  sort_order: Joi.number().integer().min(1).optional(),
});

export const getDocumentCommonSubfolderByParentIdSchema = Joi.object({
  parent_subfolder_id: Joi.string().uuid().optional().allow(null).messages({
    "string.guid": "Parent subfolder ID must be a valid UUID",
  }),
});

export default {
  createDocumentCommonSubfolderSchem,
  getDocumentCommonSubfolderByFolderIdParamsSchema,
  getDocumentCommonSubfolderByFolderIdSchema,
  getDocumentCommonSubfolderByParentIdSchema,
  deleteDocumentCommonSubfolderSchema,
  updateDocumentCommonSubfolderParamsSchema,
  updateDocumentCommonSubfolderSchema,
};
