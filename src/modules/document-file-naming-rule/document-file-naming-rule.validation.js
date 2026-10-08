import Joi from "joi";
import { validateNamingFormat } from "../../service/fileNaming.service.js";

export const createDocumentFileNamingRuleSchema = Joi.object({
  file_type: Joi.string()
    .trim()
    .min(2)
    .max(150)
    .pattern(/^(?=.*[a-zA-Z])[a-zA-Z0-9\s,./#-]+$/)
    .required()
    .messages({
      "string.base": "File type must be a string.",
      "string.empty": "File type is required.",
      "any.required": "File type is required.",
    }),

  folder_ids: Joi.array()
    .items(
      Joi.string()
        .guid({ version: ["uuidv4"] })
        .messages({ "string.guid": "Each folder_id must be a valid UUID." }),
    )
    .default([])
    .messages({
      "array.base": "Folder IDs must be an array of UUIDs.",
    }),
});

export const getAllDocumentFileNamingRulesSchema = Joi.object({
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

export const deleteDocumentFileNamingRuleSchema = Joi.object({
  document_file_naming_rule_id: Joi.string().uuid().required().messages({
    "string.guid": "Document file naming rule ID must be a valid UUID",
    "any.required": "Document file naming rule ID is required",
  }),
});

export const updateDocumentFileNamingRuleParamsSchema = Joi.object({
  document_file_naming_rule_id: Joi.string().uuid().required().messages({
    "string.guid": "Document file naming rule ID must be a valid UUID",
    "any.required": "Document file naming rule ID is required",
  }),
});

export const updateDocumentFileNamingRuleSchema = Joi.object({
  file_type: Joi.string()
    .trim()
    .min(2)
    .max(150)
    .pattern(/^(?=.*[a-zA-Z])[a-zA-Z0-9\s,./#-]+$/)
    .optional()
    .messages({
      "string.base": "File type must be a string.",
    }),

  folder_ids: Joi.array()
    .items(
      Joi.string()
        .optional()
        .guid({ version: ["uuidv4"] })
        .messages({ "string.guid": "Each folder_id must be a valid UUID." }),
    )
    .optional()
    .messages({
      "array.base": "Folder IDs must be an array of UUIDs.",
    }),
});

export const updateNamingFormatSchema = Joi.object({
  // Token rules (known tokens, no duplicates, safe separators — order is free)
  // live in the file naming service so the API and the admin screen enforce the
  // same contract. See validateNamingFormat.
  naming_format: Joi.string()
    .trim()
    .max(255)
    .required()
    .custom((value, helpers) => {
      const result = validateNamingFormat(value);
      return result.valid ? value : helpers.message(result.error);
    })
    .messages({
      "string.base": "Naming format must be a string.",
      "string.empty": "Naming format is required.",
      "any.required": "Naming format is required.",
    }),
});

export default {
  createDocumentFileNamingRuleSchema,
  getAllDocumentFileNamingRulesSchema,
  deleteDocumentFileNamingRuleSchema,
  updateDocumentFileNamingRuleParamsSchema,
  updateDocumentFileNamingRuleSchema,
  updateNamingFormatSchema,
};
