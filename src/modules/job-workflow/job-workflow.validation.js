import Joi from "joi";

// Body schemas are mostly identical to the template (job-process) ones — reuse
// them so validation rules stay in one place.
import {
  createSubStageSchema as templateCreateSubStageSchema,
  updateSubStageSchema,
  createTaskSchema as templateCreateTaskSchema,
  updateTaskSchema,
  createSubTaskSchema,
  updateSubTaskSchema,
  deleteTaskDependencySchema,
} from "../job-process/job-process.validation.js";

const uuid = Joi.string().uuid();

/* =========================================================
   JOB-SCOPED CREATE BODY OVERRIDES

   For the job-workflow create APIs, `sort_order` is managed by the backend
   (it assigns the next available value). The client must not send it, so we
   drop the template's required `sort_order` rule here — the create schema no
   longer validates or requires it. Update APIs keep the shared schemas, which
   still accept sort_order.
========================================================= */

// POST /job-workflow/jobs/:job_id/stages/:stage_id/sub-stages
export var createSubStageSchema = templateCreateSubStageSchema;

// POST /job-workflow/sub-stages/:sub_stage_id/tasks
export var createTaskSchema = templateCreateTaskSchema.fork(
  ["sort_order"],
  (schema) => schema.optional().strip(),
);

/* =========================================================
   JOB-SCOPED PARAMS
========================================================= */

// GET/POST /job-workflow/jobs/:job_id/stages/:stage_id/sub-stages
export var jobStageParamsSchema = Joi.object({
  job_id: uuid.required(),
  stage_id: uuid.required(),
});

// POST /job-workflow/jobs/:job_id/initialize
export var jobParamsSchema = Joi.object({
  job_id: uuid.required(),
});

export var subStageParamsSchema = Joi.object({
  sub_stage_id: uuid.required(),
});

export var taskParamsSchema = Joi.object({
  task_id: uuid.required(),
});

export var subTaskParamsSchema = Joi.object({
  sub_task_id: uuid.required(),
});

// PUT /job-workflow/jobs/:job_id/stages/:stage_id/sync
export var stageSyncSchema = Joi.object({
  is_synced: Joi.boolean().required(),
});

/* =========================================================
   TASK EXTENSION REQUEST
========================================================= */

export var extensionRequestParamsSchema = Joi.object({
  request_id: uuid.required(),
});

/**
 * POST /job-workflow/tasks/:task_id/notify-assignee
 *
 * The message composed in the mail panel. All optional — omitting them sends
 * the generated wording, so an API caller need not compose anything.
 */
export var notifyAssigneeSchema = Joi.object({
  // Recipients as typed in the mail popup. Omitted, it goes to the task's
  // assignee — the field is editable, so what is sent has to honour it.
  to: Joi.array().items(Joi.string().email()).single().messages({
    "string.email": "{#value} is not a valid email address",
  }),
  subject: Joi.string().trim().max(255).allow("", null),
  email_body: Joi.string().max(20000).allow("", null),
  template_email_id: Joi.string().uuid().allow("", null),
});

/**
 * POST /job-workflow/tasks/:task_id/extension-requests
 *
 * Sent as multipart (attachments ride along), so the scalar fields arrive as
 * strings and recipient_user_ids as a repeated field or a JSON string —
 * `Joi.array().single()` plus the string form both normalise to an array.
 *
 * The upper bound on extension_days is NOT here: it depends on the task's live
 * duration, so the service computes and enforces it.
 */
export var createExtensionRequestSchema = Joi.object({
  subject: Joi.string().trim().max(255).allow("", null),
  // The HTML message composed in the panel. Optional: omitting it falls back to
  // the generated wording, so an API caller need not compose one.
  email_body: Joi.string().max(20000).allow("", null),
  template_email_id: Joi.string().uuid().allow("", null),
  reason: Joi.string().trim().min(1).max(2000).required().messages({
    "any.required": "A reason for the extension is required",
    "string.empty": "A reason for the extension is required",
  }),
  extension_days: Joi.number().integer().min(1).required().messages({
    "any.required": "Extension days is required",
    "number.min": "Extension days must be greater than 0",
    "number.base": "Extension days must be a number",
  }),
  recipient_user_ids: Joi.array().items(uuid).single().min(1).required().messages({
    "array.min": "Select at least one recipient",
    "any.required": "Select at least one recipient",
  }),
});

/**
 * POST /job-workflow/extension-requests/:request_id/respond  (token-secured)
 *
 * approved_days lets the responder grant a different number than was asked for
 * — omitting it approves exactly what the builder requested. The upper bound is
 * not here because it depends on the task's live duration; the service
 * recomputes and enforces it.
 */
/**
 * POST /job-workflow/tasks/:task_id/extension-requests/public  (token-secured)
 *
 * The assignee's own request, raised from the "Add Days" link in the task
 * assignment email. The upper bound on extension_days is not here — it is the
 * task's live duration, which the service recomputes and enforces.
 */
export var createAssigneeExtensionRequestSchema = Joi.object({
  extension_days: Joi.number().integer().min(1).required().messages({
    "any.required": "Extension days is required",
    "number.min": "Extension days must be greater than 0",
    "number.base": "Extension days must be a number",
  }),
  reason: Joi.string().trim().min(1).max(2000).required().messages({
    "any.required": "A reason for the extension is required",
    "string.empty": "A reason for the extension is required",
  }),
});

export var respondExtensionRequestSchema = Joi.object({
  decision: Joi.string().valid("APPROVED", "REJECTED").required().messages({
    "any.only": "Decision must be APPROVED or REJECTED",
  }),
  approved_days: Joi.number().integer().min(1).allow(null).messages({
    "number.min": "Approved days must be greater than 0",
    "number.base": "Approved days must be a number",
  }),
  comments: Joi.string().trim().max(1000).allow("", null),
  responded_by_email: Joi.string().email().allow("", null),
});

export default {
  jobStageParamsSchema,
  jobParamsSchema,
  subStageParamsSchema,
  taskParamsSchema,
  subTaskParamsSchema,
  stageSyncSchema,
  extensionRequestParamsSchema,
  notifyAssigneeSchema,
  createExtensionRequestSchema,
  createAssigneeExtensionRequestSchema,
  respondExtensionRequestSchema,
  // Re-exported body schemas
  createSubStageSchema,
  updateSubStageSchema,
  createTaskSchema,
  updateTaskSchema,
  createSubTaskSchema,
  updateSubTaskSchema,
  deleteTaskDependencySchema,
};
