import Joi from "joi";
import { MANAGED_EXTENSIONS } from "../../utils/documentEdit.js";

/**
 * Query keys are snake_case here, even though the client sends camelCase.
 *
 * `camelToSnakeMiddleware` runs ahead of this schema and rewrites the keys of
 * `req.query` as well as the body, so `sortBy` has already become `sort_by` by
 * the time Joi sees it. Single-word keys pass through unchanged, which is why
 * only the two-word ones are spelled differently from the wire format. Every
 * other module behind this middleware declares its query schema the same way.
 */
export const listDocumentsSchema = Joi.object({
  search: Joi.string().allow("").max(255).optional(),
  // The family: every spreadsheet, every Word document, every PDF.
  format: Joi.string().valid("all", "pdf", "spreadsheet", "word").allow("").optional(),
  // Or one exact file type, when "all spreadsheets" is not what they meant.
  extension: Joi.string().valid(...MANAGED_EXTENSIONS).allow("").optional(),
  source: Joi.string().valid("all", "generated", "uploaded").allow("").optional(),
  editable: Joi.alternatives()
    .try(Joi.boolean(), Joi.string().valid("true", "false", "all", ""))
    .optional(),
  status: Joi.string().valid("active", "trashed", "all").allow("").optional(),
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(100).optional(),
  // Only the keys are converted, never the values — so the sort target is still
  // spelled the way the frontend sends it.
  sort_by: Joi.string().valid("name", "createdAt", "updatedAt", "size").optional(),
  sort_order: Joi.string().valid("ASC", "DESC", "asc", "desc").optional(),
});

/**
 * The audit history's paging.
 *
 * A generous default: a document's history is normally a handful of rows and the
 * drawer shows them all, so paging is the exception rather than the rule. The
 * cap is there for the file that has been edited every day for a year.
 */
export const documentActivitySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(200).optional(),
  offset: Joi.number().integer().min(0).optional(),
});

export const setDocumentEditableSchema = Joi.object({
  // `null` is meaningful — it clears the per-file ruling rather than setting
  // one — so the field is required and nullable rather than optional.
  editable: Joi.boolean().allow(null).required(),
});
