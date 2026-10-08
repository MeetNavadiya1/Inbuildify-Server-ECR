import Joi from "joi";
import { NAME_PATTERN, NAME_PATTERN_MESSAGE } from "../../utils/validationPatterns.js";

export const createEstateStageSchema = Joi.object({
  estate_id: Joi.string().uuid().required().messages({
    "string.guid": "estate ID must be a valid UUID.",
  }),
  name: Joi.string()
    .trim()
    .min(2)
    .max(150)
    .pattern(NAME_PATTERN)
    .required(),
  release_date: Joi.date().optional().allow(null),
  attach_file: Joi.alternatives().try(
    Joi.array().items(Joi.string().uri()),
    Joi.string().uri().allow(null, ""),
  ).optional().messages({
    "array.base": "attach_file must be an array of URLs",
    "string.uri": "attach_file must be a valid URL",
    "alternatives.match": "attach_file must be an array of URLs or a single URL",
  }),
});

export const getALLEstateStageSchema = Joi.object({
  estate_id: Joi.string().uuid().optional().messages({
    "string.guid": "estate ID must be a valid UUID",
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

export const deleteEstateStageSchema = Joi.object({
  estate_stage_id: Joi.string().uuid().required().messages({
    "string.guid": "estate stage ID must be a valid UUID",
    "any.required": "estate stage ID is required",
  }),
});

export const updateEstateStageParamsSchema = Joi.object({
  estate_stage_id: Joi.string().uuid().required().messages({
    "string.guid": "estate stage ID must be a valid UUID",
    "any.required": "estate stage ID is required",
  }),
});

export const updsteEstateStageSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(2)
    .max(150)
    .pattern(NAME_PATTERN)
    .optional(),
  release_date: Joi.date().optional().allow(null),
  // attach_file may be auto-populated from an uploaded file's URL by the case
  // converter middleware; it is not read on update, but must validate cleanly.
  attach_file: Joi.alternatives().try(
    Joi.array().items(Joi.string().uri()),
    Joi.string().uri(),
  ).optional().allow(null, ""),
  // URLs of already-uploaded attachments the client wants to keep.
  existing_files: Joi.alternatives().try(
    Joi.array().items(Joi.string().uri()),
    Joi.string().uri().allow(""),
  ).optional().allow(null, "").messages({
    "string.uri": "existing_files must be valid URLs",
  }),
  // Explicit signal that the attachment set was edited (covers "all removed").
  documents_changed: Joi.boolean().optional(),
});

export default {
  createEstateStageSchema,
  getALLEstateStageSchema,
  deleteEstateStageSchema,
  updateEstateStageParamsSchema,
  updsteEstateStageSchema,
};
