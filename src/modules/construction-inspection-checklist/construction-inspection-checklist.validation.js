import Joi from "joi";

export const createConstructionInspectionChecklistSchema = Joi.object({
  builder: Joi.string().uuid().allow(null),
  construction_type_id: Joi.string().uuid().allow(null),
  construction_stage_id: Joi.string().uuid().allow(null),
  field_name: Joi.string().valid("checklist", "section").required(),
  description: Joi.string().max(500).required(),
  sort_order: Joi.number().integer().min(1).default(1),
  construction_option_id: Joi.string().uuid().allow(null),
  section_id: Joi.string().uuid().allow(null),
  add_all_existing_jobs: Joi.boolean().default(true),
});

export const getConstructionInspectionChecklistsSchema = Joi.object({
  construction_type_id: Joi.string().uuid().optional(),
  construction_stage_id: Joi.string().uuid().optional(),
  field_name: Joi.string().valid("checklist", "section").optional(),
  builder: Joi.string().uuid().optional(),
});

export const updateConstructionInspectionChecklistSchema = Joi.object({
  builder: Joi.string().uuid().allow(null).optional(),
  construction_type_id: Joi.string().uuid().allow(null).optional(),
  construction_stage_id: Joi.string().uuid().allow(null).optional(),
  field_name: Joi.string().valid("checklist", "section").optional(),
  description: Joi.string().max(500).optional(),
  sort_order: Joi.number().integer().min(1).optional(),
  construction_option_id: Joi.string().uuid().allow(null).optional(),
  section_id: Joi.string().uuid().allow(null).optional(),
  add_all_existing_jobs: Joi.boolean().optional(),
});

export const deleteConstructionInspectionChecklistSchema = Joi.object({
  id: Joi.string().uuid().required().messages({
    "string.guid": "ID must be a valid UUID",
    "any.required": "ID is required",
  }),
});

export const updateExistingJobsSchema = Joi.object({
  add_all_existing_jobs: Joi.boolean().required().messages({
    "boolean.base": "add_all_existing_jobs must be a boolean",
    "any.required": "add_all_existing_jobs is required",
  }),
});

export default {
  createConstructionInspectionChecklistSchema,
  getConstructionInspectionChecklistsSchema,
  updateConstructionInspectionChecklistSchema,
  deleteConstructionInspectionChecklistSchema,
  updateExistingJobsSchema,
};
