import Joi from "joi";
import { DOCUMENT_SYNC_SCOPE_NAMES } from "../../constants/documentSync.js";

export const createFolderSchema = Joi.object({
  name: Joi.string().trim().max(255).required().messages({
    "string.empty": "Folder name is required",
    "any.required": "Folder name is required",
    "string.max": "Folder name cannot exceed 255 characters",
  }),
  parent_id: Joi.string().uuid().allow(null, "").optional().messages({
    "string.guid": "Invalid parent folder ID",
  }),
});

export const renameFolderSchema = Joi.object({
  name: Joi.string().trim().max(255).required().messages({
    "string.empty": "Folder name is required",
    "any.required": "Folder name is required",
    "string.max": "Folder name cannot exceed 255 characters",
  }),
});

export const renameFileSchema = Joi.object({
  original_name: Joi.string().trim().max(255).required().messages({
    "string.empty": "File name is required",
    "any.required": "File name is required",
    "string.max": "File name cannot exceed 255 characters",
  }),
});

export const uploadFileSchema = Joi.object({
  folder_id: Joi.string().allow(null, "", "root").optional().custom((value, helpers) => {
    if (value && value !== "root" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
      return helpers.message("Invalid folder ID format");
    }
    return value;
  }),
  file: Joi.any().optional(), // Allow the file field injected by camelToSnakeMiddleware
}).unknown(true); // Allow other fields to prevent strict blocking during multi-part uploads

export const moveFileSchema = Joi.object({
  new_folder_id: Joi.string().allow(null, "", "root").optional().custom((value, helpers) => {
    if (value && value !== "root" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
      return helpers.message("Invalid new folder ID format");
    }
    return value;
  }),
});

export const moveFolderSchema = Joi.object({
  new_parent_id: Joi.string().allow(null, "", "root").optional().custom((value, helpers) => {
    if (value && value !== "root" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
      return helpers.message("Invalid new parent ID format");
    }
    return value;
  }),
});

// The scopes come from the sync service's registry, so a new entity type only
// has to be added there — this schema follows automatically.
export const syncDocumentNamesSchema = Joi.object({
  scope: Joi.string().valid(...DOCUMENT_SYNC_SCOPE_NAMES).required().messages({
    "any.only": `Scope must be one of: ${DOCUMENT_SYNC_SCOPE_NAMES.join(", ")}`,
    "any.required": "Scope is required",
  }),
  entity_id: Joi.string().uuid().required().messages({
    "string.guid": "Invalid entity ID",
    "any.required": "Entity ID is required",
  }),
});

export const getFilesSchema = Joi.object({
  folder_id: Joi.string().allow(null, "", "root").optional().custom((value, helpers) => {
    if (value && value !== "root" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
      return helpers.message("Invalid folder ID format");
    }
    return value;
  }),
});
