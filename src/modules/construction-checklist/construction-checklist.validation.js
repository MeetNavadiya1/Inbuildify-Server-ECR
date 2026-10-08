import Joi from "joi";
import { NAME_PATTERN, NAME_PATTERN_MESSAGE } from "../../utils/validationPatterns.js";

export const createConstructionChecklistValidation = Joi.object({
  name: Joi.string()
    .min(2)
    .max(255)
    .pattern(NAME_PATTERN)
    .required()
    .messages({
      "string.empty": "Name cannot be empty",
      "any.required": "Name is required",
    }),
  construction_type_id: Joi.string().uuid().required().messages({
    "string.uuid": "Construction type ID must be a valid UUID",
  }),
  construction_stage_id: Joi.string().uuid().required().messages({
    "string.uuid": "Construction stage ID must be a valid UUID",
  }),
  supplier_type_id: Joi.string().uuid().optional().messages({
    "string.uuid": "Supplier type ID must be a valid UUID",
  }),
  sort_order: Joi.number().integer().min(1).optional().messages({
    "number.integer": "Sort order must be an integer",
    "number.min": "Sort order must be at least 1",
  }),
  data_required: Joi.boolean().optional().messages({
    "boolean.base": "Data required must be a boolean",
  }),
  supplier: Joi.boolean().optional().messages({
    "boolean.base": "Supplier must be a boolean",
  }),
  claim: Joi.boolean().optional().messages({
    "boolean.base": "Claim must be a boolean",
  }),
  dependent: Joi.boolean().optional().messages({
    "boolean.base": "Dependent must be a boolean",
  }),
  no_of_days: Joi.number().integer().min(1).optional().messages({
    "number.integer": "No of days must be an integer",
    "number.min": "No of days must be at least 1",
  }),
  notify: Joi.boolean().optional().messages({
    "boolean.base": "Notify must be a boolean",
  }),
  milestone: Joi.boolean().optional().messages({
    "boolean.base": "Milestone must be a boolean",
  }),
  attachment_mandatory: Joi.boolean().optional().messages({
    "boolean.base": "Attachment mandatory must be a boolean",
  }),
  attachment_mandatory_name: Joi.string()
    .min(2)
    .max(255)
    .pattern(NAME_PATTERN)
    .optional()
    .allow(null)
    .messages({
      "string.base": "Attachment mandatory name must be a string",
    }),
  cost_center_id: Joi.array().items(Joi.string().uuid()).default([]).messages({
    "string.uuid": "Cost center ID must be a valid UUID",
  }),
  construction_option_id: Joi.array()
    .items(Joi.string().uuid())
    .default([])
    .messages({
      "string.uuid": "Construction option ID must be a valid UUID",
    }),
  compliance_type_id: Joi.string().uuid().optional().allow(null).messages({
    "string.uuid": "Compliance type ID must be a valid UUID",
  }),
  builder: Joi.string().uuid().required().allow(null).messages({
    "string.uuid": "Builder ID must be a valid UUID",
  }),
});

export const updateConstructionChecklistValidation = Joi.object({
  name: Joi.string()
    .min(2)
    .max(255)
    .pattern(NAME_PATTERN)
    .optional()
    .messages({
      "string.empty": "Name cannot be empty",
      "string.base": "Name must be a string",
    }),
  construction_type_id: Joi.string().uuid().optional().allow(null).messages({
    "string.uuid": "Construction type ID must be a valid UUID",
  }),
  construction_stage_id: Joi.string().uuid().optional().allow(null).messages({
    "string.uuid": "Construction stage ID must be a valid UUID",
  }),
  supplier_type_id: Joi.string().uuid().optional().allow(null).messages({
    "string.uuid": "Supplier type ID must be a valid UUID",
  }),
  sort_order: Joi.number().integer().min(1).optional().messages({
    "number.integer": "Sort order must be an integer",
    "number.min": "Sort order must be at least 1",
  }),
  data_required: Joi.boolean().optional().messages({
    "boolean.base": "Data required must be a boolean",
  }),
  supplier: Joi.boolean().optional().messages({
    "boolean.base": "Supplier must be a boolean",
  }),
  claim: Joi.boolean().optional().messages({
    "boolean.base": "Claim must be a boolean",
  }),
  dependent: Joi.boolean().optional().messages({
    "boolean.base": "Dependent must be a boolean",
  }),
  no_of_days: Joi.number().integer().min(1).optional().messages({
    "number.integer": "No of days must be an integer",
    "number.min": "No of days must be at least 1",
  }),
  notify: Joi.boolean().optional().messages({
    "boolean.base": "Notify must be a boolean",
  }),
  milestone: Joi.boolean().optional().messages({
    "boolean.base": "Milestone must be a boolean",
  }),
  attachment_mandatory: Joi.boolean().optional().messages({
    "boolean.base": "Attachment mandatory must be a boolean",
  }),
  attachment_mandatory_name: Joi.string()
    .optional()
    .max(255)
    .pattern(NAME_PATTERN)
    .allow(null)
    .messages({
      "string.base": "Attachment mandatory name must be a string",
    }),
  cost_center_id: Joi.array().items(Joi.string().uuid()).default([]).messages({
    "string.uuid": "Cost center ID must be a valid UUID",
  }),
  construction_option_id: Joi.array()
    .items(Joi.string().uuid())
    .default([])
    .messages({
      "string.uuid": "Cost center ID must be a valid UUID",
    }),
  compliance_type_id: Joi.string().uuid().optional().allow(null).messages({
    "string.uuid": "Compliance type ID must be a valid UUID",
  }),
  builder: Joi.string().uuid().optional().allow(null).messages({
    "string.uuid": "Builder ID must be a valid UUID",
  }),
  po_folder_id: Joi.string().uuid().optional().messages({
    "string.uuid": "po folder ID must be a valid UUID",
  }),

  job_documents_folder_id: Joi.string().uuid().optional().messages({
    "string.uuid": "job document folder ID must be a valid UUID",
  }),
}).min(1);

export const getConstructionChecklistByIdValidation = Joi.object({
  construction_checklist_id: Joi.string().uuid().required().messages({
    "string.uuid": "Construction checklist ID must be a valid UUID",
    "any.required": "Construction checklist ID is required",
  }),
});

export const queryValidation = Joi.object({

  name: Joi.string().max(255).optional().messages({
    "string.base": "Name must be a string",
  }),
  construction_type_id: Joi.string().uuid().optional().messages({
    "string.uuid": "Construction type ID must be a valid UUID",
  }),
  construction_stage_id: Joi.string().uuid().optional().messages({
    "string.uuid": "Construction stage ID must be a valid UUID",
  }),

  builder: Joi.string().uuid().optional().messages({
    "string.uuid": "Builder ID must be a valid UUID",
  }),
});

export default {
  createConstructionChecklistValidation,
  updateConstructionChecklistValidation,
  getConstructionChecklistByIdValidation,
  queryValidation,
};
