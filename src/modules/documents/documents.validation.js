import Joi from "joi";
import { SUPPORTED_ENTITY_TYPES } from "./documents.entities.js";
import { DOCUMENT_TYPE_OPTIONS } from "../../constants/driveFile.js";

/**
 * Validation for the generic documents API. Body schemas run AFTER
 * camelToSnakeMiddleware, so their keys are snake_case (entity_type, entity_id,
 * parent_id, folder_id). The GET query is not case-converted, so it stays
 * camelCase (entityType, entityId, folderId).
 *
 * `entity_id` is required for entity-scoped types (job, lead) and optional for
 * the global drive (sdrive), which has no owning entity.
 */

const entityTypeRule = Joi.string()
  .lowercase()
  .valid(...SUPPORTED_ENTITY_TYPES)
  .required()
  .messages({
    "any.only": `Entity type must be one of: ${SUPPORTED_ENTITY_TYPES.join(", ")}`,
    "any.required": "Entity type is required",
    "string.empty": "Entity type is required",
  });

// Required unless the entity type is the reference-less global drive.
const conditionalEntityId = (key) =>
  Joi.string()
    .uuid()
    .when(key, {
      is: "sdrive",
      then: Joi.optional().allow(null, ""),
      otherwise: Joi.required(),
    })
    .messages({
      "string.guid": "Entity ID must be a valid UUID",
      "any.required": "Entity ID is required for this entity type",
    });

export const createDocumentFolderSchema = Joi.object({
  entity_type: entityTypeRule,
  entity_id: conditionalEntityId("entity_type"),
  name: Joi.string().trim().min(1).max(255).required().messages({
    "string.empty": "Folder name is required",
    "any.required": "Folder name is required",
    "string.max": "Folder name must not exceed 255 characters",
  }),
  parent_id: Joi.string().uuid().optional().allow(null, "").messages({
    "string.guid": "Parent folder ID must be a valid UUID",
  }),
});

export const uploadDocumentSchema = Joi.object({
  entity_type: entityTypeRule,
  entity_id: conditionalEntityId("entity_type"),
  folder_id: Joi.string().uuid().optional().allow(null, "", "root").messages({
    "string.guid": "Folder ID must be a valid UUID",
  }),
  // camelToSnakeMiddleware injects `file` (the multipart field) onto the body;
  // allow it plus any other multipart text fields so validation never blocks a
  // legitimate upload. Mirrors drive.validation.uploadFileSchema.
  file: Joi.any().optional(),
}).unknown(true);

export const getDocumentsSchema = Joi.object({
  entityType: entityTypeRule,
  entityId: conditionalEntityId("entityType"),
  folderId: Joi.string().uuid().optional().allow(null, "").messages({
    "string.guid": "Folder ID must be a valid UUID",
  }),
  // view=user re-points a job/lead read at the user who owns those documents,
  // returning their whole set instead of just this entity's.
  view: Joi.string().lowercase().valid("entity", "user").optional().allow("", null).messages({
    "any.only": "View must be one of: entity, user",
  }),
  groupBy: Joi.string().lowercase().valid("entity", "user").optional().allow("", null).messages({
    "any.only": "groupBy must be one of: entity, user",
  }),
});

// GET /documents/all — consolidated flat list (query params, camelCase).
export const getAllDocumentsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1).messages({
    "number.base": "Page must be a number",
  }),
  limit: Joi.number().integer().min(1).max(100).default(20).messages({
    "number.base": "Limit must be a number",
    "number.max": "Limit must not exceed 100",
  }),
  search: Joi.string().max(255).optional().allow("", null),
  scope: Joi.string().valid("job", "lead", "drive").optional().allow("", null).messages({
    "any.only": "Scope must be one of: job, lead, drive",
  }),
  uploadedBy: Joi.string().uuid().optional().allow("", null).messages({
    "string.guid": "uploadedBy must be a valid UUID",
  }),
  // Every document belonging to this user (their leads' + jobs' files, plus
  // their own uploads) — wider than uploadedBy.
  userId: Joi.string().uuid().optional().allow("", null).messages({
    "string.guid": "userId must be a valid UUID",
  }),
  starred: Joi.boolean().optional(),
  // ── Advanced filters (all combinable) ──────────────────────────────────────
  builderId: Joi.string().uuid().optional().allow("", null).messages({
    "string.guid": "builderId must be a valid UUID",
  }),
  // A customer is a lead/client; a project is a job.
  customerId: Joi.string().uuid().optional().allow("", null).messages({
    "string.guid": "customerId must be a valid UUID",
  }),
  projectId: Joi.string().uuid().optional().allow("", null).messages({
    "string.guid": "projectId must be a valid UUID",
  }),
  documentType: Joi.string()
    .valid(...DOCUMENT_TYPE_OPTIONS.map((o) => o.value))
    .optional()
    .allow("", null)
    .messages({ "any.only": "Unknown document type" }),
  // ISO datetime, or a plain YYYY-MM-DD (the service expands "to" to end-of-day).
  dateFrom: Joi.date().iso().optional().allow("", null),
  dateTo: Joi.date().iso().optional().allow("", null),
});

// GET /documents/filter-options — dropdown data for the filter bar. No inputs;
// tolerate stray query keys so a cache-buster can't 400 it.
export const getFilterOptionsSchema = Joi.object({}).unknown(true);

// GET /documents/users — users a documents browser can be pointed at.
export const getDocumentUsersSchema = Joi.object({
  search: Joi.string().max(255).optional().allow("", null),
});

// GET /documents/my — the Contact's own documents (query params, camelCase).
// No userId: the caller is always the subject.
export const getMyDocumentsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1).messages({
    "number.base": "Page must be a number",
  }),
  limit: Joi.number().integer().min(1).max(100).default(20).messages({
    "number.base": "Limit must be a number",
    "number.max": "Limit must not exceed 100",
  }),
  search: Joi.string().max(255).optional().allow("", null),
  // One of the caller's own leads/jobs (from `projects` in the list response).
  projectId: Joi.string().uuid().optional().allow("", null).messages({
    "string.guid": "projectId must be a valid UUID",
  }),
  documentType: Joi.string()
    .valid(...DOCUMENT_TYPE_OPTIONS.map((o) => o.value))
    .optional()
    .allow("", null)
    .messages({ "any.only": "Unknown document type" }),
  dateFrom: Joi.date().iso().optional().allow("", null),
  dateTo: Joi.date().iso().optional().allow("", null),
});

// GET /documents/my/:fileId/view
export const myDocumentParamsSchema = Joi.object({
  fileId: Joi.string().uuid().required().messages({
    "string.guid": "File ID must be a valid UUID",
    "any.required": "File ID is required",
  }),
});

export const myDocumentViewQuerySchema = Joi.object({
  download: Joi.boolean().optional(),
}).unknown(true);

export default {
  getMyDocumentsSchema,
  myDocumentParamsSchema,
  myDocumentViewQuerySchema,
  createDocumentFolderSchema,
  uploadDocumentSchema,
  getDocumentsSchema,
  getAllDocumentsSchema,
  getDocumentUsersSchema,
  getFilterOptionsSchema,
};
