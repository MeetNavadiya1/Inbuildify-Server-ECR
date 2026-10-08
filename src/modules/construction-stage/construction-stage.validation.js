import Joi from "joi";
import { NAME_PATTERN, NAME_PATTERN_MESSAGE } from "../../utils/validationPatterns.js";

const WORKFLOW_TYPES = ["PRE_CONSTRUCTION", "CONSTRUCTION"];
const STAGE_STATUS = ["active", "inactive"];
const JOB_STAGE_STATUS = ["pending", "in_progress", "completed", "skipped"];

const hexColor = Joi.string()
  .trim()
  .pattern(/^#([0-9A-F]{3}|[0-9A-F]{6})$/i)
  .allow(null);

export const createConstructionStageSchema = Joi.object({
  builder: Joi.string().uuid().optional().messages({
    "string.guid": "builder ID must be a valid UUID",
  }),
  // Optional: workflow-level stages are not tied to a construction type.
  construction_type_id: Joi.string().uuid().optional().allow(null).messages({
    "string.guid": "construction type ID must be a valid UUID",
  }),
  workflow_type: Joi.string().valid(...WORKFLOW_TYPES).default("CONSTRUCTION").optional(),
  stage_name: Joi.string()
    .trim()
    .min(2)
    .max(255)
    .pattern(NAME_PATTERN)
    .required(),
  days: Joi.number().integer().min(1).max(365),
  sort_order: Joi.number().integer().min(1).default(1).optional(),
  site_image: Joi.boolean().default(false),
  inspection: Joi.string()
    .trim()
    .max(100)
    .valid("not_required", "stage_start", "stage_completed")
    .default("not_required")
    .optional(),
  bg_color: hexColor.optional().messages({
    "string.pattern.base": "Enter valid background color in HEX format (e.g., #FF5733)",
  }),
  font_color: hexColor.optional().messages({
    "string.pattern.base": "Enter valid font color in HEX format (e.g., #FFF453)",
  }),
  icon: Joi.string().trim().max(100).allow(null, "").optional(),
  status: Joi.string().valid(...STAGE_STATUS).default("active").optional(),
});

export const getAllConstructionStageSchema = Joi.object({
  builder: Joi.string().uuid().optional().messages({
    "string.guid": "builder ID must be a valid UUID",
  }),
  construction_type_id: Joi.string().uuid().optional().messages({
    "string.guid": "construction type ID must be a valid UUID",
  }),
  workflow_type: Joi.string().valid(...WORKFLOW_TYPES).optional(),
});

export const deleteConstructionStageSchema = Joi.object({
  construction_stage: Joi.string().uuid().optional().messages({
    "string.guid": "construction stage ID must be a valid UUID",
  }),
});

export const updateConstructionStageParamsSchema = Joi.object({
  construction_stage: Joi.string().uuid().optional().messages({
    "string.guid": "construction stage ID must be a valid UUID",
  }),
});

export const updateConstructionStageSchema = Joi.object({
  stage_name: Joi.string()
    .trim()
    .min(2)
    .max(255)
    .pattern(NAME_PATTERN)
    .optional(),
  workflow_type: Joi.string().valid(...WORKFLOW_TYPES).optional(),
  days: Joi.number().integer().min(1).max(365).optional(),
  sort_order: Joi.number().integer().min(1).optional(),
  site_image: Joi.boolean().optional(),
  inspection: Joi.string()
    .trim()
    .max(100)
    .valid("not_required", "stage_start", "stage_completed")
    .optional(),
  bg_color: hexColor.optional().messages({
    "string.pattern.base": "Enter valid background color in HEX format (e.g., #FF5733)",
  }),
  font_color: hexColor.optional().messages({
    "string.pattern.base": "Enter valid font color in HEX format (e.g., #FFF453)",
  }),
  icon: Joi.string().trim().max(100).allow(null, "").optional(),
  status: Joi.string().valid(...STAGE_STATUS).optional(),
});

// ── Reorder ───────────────────────────────────────────────────────────────────
export const reorderConstructionStageSchema = Joi.object({
  items: Joi.array()
    .items(
      Joi.object({
        construction_stage: Joi.string().uuid().required(),
        sort_order: Joi.number().integer().min(1).required(),
      }),
    )
    .min(1)
    .required(),
});

// ── Job-wise stage mapping ─────────────────────────────────────────────────────
export const jobIdParamSchema = Joi.object({
  jobId: Joi.string().uuid().required().messages({
    "string.guid": "jobId must be a valid UUID",
    "any.required": "jobId is required",
  }),
});

export const getJobStagesQuerySchema = Joi.object({
  workflow_type: Joi.string().valid(...WORKFLOW_TYPES).optional(),
});

export const initializeJobStagesSchema = Joi.object({
  workflow_type: Joi.string().valid(...WORKFLOW_TYPES).default("CONSTRUCTION").optional(),
});

export const jobStageStatusParamSchema = Joi.object({
  jobId: Joi.string().uuid().required(),
  jobConstructionStageId: Joi.string().uuid().required(),
});

export const updateJobStageStatusSchema = Joi.object({
  status: Joi.string().valid(...JOB_STAGE_STATUS).required().messages({
    "any.only": `status must be one of: ${JOB_STAGE_STATUS.join(", ")}`,
    "any.required": "status is required",
  }),
});

export default {
  createConstructionStageSchema,
  getAllConstructionStageSchema,
  deleteConstructionStageSchema,
  updateConstructionStageParamsSchema,
  updateConstructionStageSchema,
  reorderConstructionStageSchema,
  jobIdParamSchema,
  getJobStagesQuerySchema,
  initializeJobStagesSchema,
  jobStageStatusParamSchema,
  updateJobStageStatusSchema,
};
