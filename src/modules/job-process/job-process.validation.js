import Joi from "joi";
import { NAME_PATTERN, NAME_PATTERN_MESSAGE } from "../../utils/validationPatterns.js";

const uuid = Joi.string().uuid();

/* =========================================================
   STAGE
========================================================= */

export var stageParamsSchema = Joi.object({
  stage_id: uuid.required(),
});

export var createStageSchema = Joi.object({
  name: Joi.string()
    .min(2)
    .max(200)
    .pattern(NAME_PATTERN)
    .required(),
  functionality_id: uuid.required(),
  sort_order: Joi.number().integer().min(1).required(),
  dependent_stage_id: uuid.allow(null),
});

export var updateStageSchema = Joi.object({
  name: Joi.string()
    .min(2)
    .max(200)
    .pattern(NAME_PATTERN)
    .optional(),
  sort_order: Joi.number().integer().min(1).optional(),
  functionality_id: uuid.optional(),
  dependent_stage_id: uuid.allow(null),
});

export var deleteSubStageSchema = Joi.object({
  task_id: uuid.optional(),
});

/* =========================================================
   SUB-STAGE
========================================================= */

export var subStageParamsSchema = Joi.object({
  sub_stage_id: uuid.required(),
});

export var createSubStageSchema = Joi.object({
  name: Joi.string()
    .min(2)
    .max(200)
    .pattern(NAME_PATTERN)
    .required(),
  // Optional on create: when omitted, the service assigns the next available
  // sort value (max + 1). An explicit value is still honored (with rebalancing).
  //sort_order: Joi.number().integer().min(1).optional(),
  is_synced: Joi.boolean().optional(),
});

export var updateSubStageSchema = Joi.object({
  name: Joi.string()
    .min(2)
    .max(200)
    .pattern(NAME_PATTERN)
    .optional(),
  sort_order: Joi.number().integer().min(1).optional(),
  is_completed: Joi.boolean().optional(),
  is_skipped: Joi.boolean().optional(),
  is_synced: Joi.boolean().optional(),
});

/* =========================================================
   TASK
========================================================= */

export var taskParamsSchema = Joi.object({
  task_id: uuid.required(),
});

export var createTaskSchema = Joi.object({
  name: Joi.string()
    .min(2)
    .max(200)
    .pattern(NAME_PATTERN)
    .required(),
  // Optional: the Add Task form does not collect a description, so an omitted
  // (or blank) value is stored as null rather than rejected.
  description: Joi.string().allow(null, "").optional(),
  // Optional on create: when omitted, the service assigns the next available
  // sort value (max + 1). An explicit value is still honored (with rebalancing).
  sort_order: Joi.number().integer().min(1).optional(),
  no_of_days: Joi.number().required().integer().allow(null),
  // assignee_id is the ROLE; assignee_user_id is the person holding it. Sending
  // a user without a role is rejected by the service, and for the Builder role
  // the service resolves the job's builder user itself.
  assignee_id: uuid.allow(null),
  assignee_user_id: uuid.allow(null),
  // service_id is WHAT the task is; supplier_id is WHO is doing it. This is the
  // pair the workflow UI collects. Sending a supplier without a service is
  // rejected by the service — there is nothing to book them against.
  service_id: uuid.allow(null),
  supplier_id: uuid.allow(null),
  folder_id: uuid.allow(null),
  notify: Joi.boolean().default(false),
  milestone: Joi.boolean().default(false),
  attachment_mandatory: Joi.boolean().default(false),
  is_synced: Joi.boolean().optional(),
  predecessor_task_ids: Joi.array().items(uuid).default([]),
});

export var updateTaskSchema = Joi.object({
  name: Joi.string()
    .min(2)
    .max(200)
    .pattern(NAME_PATTERN)
    .optional(),
  description: Joi.string().allow(null),
  sort_order: Joi.number().integer().min(1).optional(),
  no_of_days: Joi.number().integer().allow(null),
  assignee_id: uuid.allow(null),
  assignee_user_id: uuid.allow(null),
  service_id: uuid.allow(null),
  supplier_id: uuid.allow(null),
  folder_id: uuid.allow(null),
  notify: Joi.boolean().optional(),
  milestone: Joi.boolean().optional(),
  attachment_mandatory: Joi.boolean().optional(),
  is_completed: Joi.boolean().optional(),
  is_synced: Joi.boolean().optional(),
  actual_date: Joi.string().allow(null, "").optional(),
  // Hand-entered estimated end date. Setting it pins the task against the
  // workflow recalculation; sending null hands it back to the chain.
  estimated_end_date: Joi.string().allow(null, "").optional(),
  estimated_date_locked: Joi.boolean().optional(),
  // Confirmation that the later tasks may be re-based on this task's actual
  // date. Only needed when "Re-calculate the Estimated dates automatically
  // based on Actual date changes" is off.
  apply_actual_date: Joi.boolean().optional(),
  notes: Joi.string().allow(null, "").optional(),
  attachments: Joi.array().items(Joi.object()).allow(null).optional(),
  predecessor_task_ids: Joi.array().items(uuid).optional(),
});

/* =========================================================
   SUB-TASK
========================================================= */

export var subTaskParamsSchema = Joi.object({
  sub_task_id: uuid.required(),
});

export var createSubTaskSchema = Joi.object({
  name: Joi.string()
    .min(2)
    .max(200)
    .pattern(NAME_PATTERN)
    .required(),
  sort_order: Joi.number().integer().min(1).required(),
});

export var updateSubTaskSchema = Joi.object({
  name: Joi.string()
    .min(2)
    .max(200)
    .pattern(NAME_PATTERN)
    .optional(),
  sort_order: Joi.number().integer().min(1).optional(),
});

/* =========================================================
   TASK DEPENDENCY
========================================================= */

export var deleteTaskDependencySchema = Joi.object({
  task_id: uuid.required(),
  predecessor_task_id: uuid.required(),
});

export default {
  stageParamsSchema,
  createStageSchema,
  updateStageSchema,
  deleteSubStageSchema,
  subStageParamsSchema,
  createSubStageSchema,
  updateSubStageSchema,
  taskParamsSchema,
  createTaskSchema,
  updateTaskSchema,
  subTaskParamsSchema,
  createSubTaskSchema,
  updateSubTaskSchema,
  deleteTaskDependencySchema,
};
