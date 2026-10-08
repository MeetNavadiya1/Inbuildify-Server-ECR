import Joi from "joi";

export const createNoteSchema = Joi.object({
  leads_id: Joi.string().uuid().when("note_type", {
    is: "send",
    then: Joi.required(),
    otherwise: Joi.forbidden().messages({ "any.unknown": "leads_id is not allowed for reply type" }),
  }).messages({
    "string.uuid": "leads_id must be a valid UUID",
    "any.required": "leads_id is required for send type",
  }),
  // Optional — when present, the note belongs to a job's timeline (not the lead's).
  job_id: Joi.string().uuid().optional().allow(null, "").messages({
    "string.uuid": "job_id must be a valid UUID",
  }),
  description: Joi.string().max(500).allow(null, "").optional().messages({
    "string.max": "description must be at most 500 characters",
  }),
  note_tag_id: Joi.array().items(Joi.string().uuid()).when("note_type", {
    is: "reply",
    then: Joi.forbidden().messages({ "any.unknown": "note_tag_id is not allowed for reply type" }),
    otherwise: Joi.optional(),
  }).messages({
    "array.base": "note_tag_id must be an array of UUIDs",
  }),
  send_to_customer: Joi.boolean().optional(),
  create_follow_up_task: Joi.boolean().when("note_type", {
    is: "reply",
    then: Joi.forbidden().messages({ "any.unknown": "create_follow_up_task is not allowed for reply type" }),
    otherwise: Joi.optional(),
  }),
  task_name: Joi.string().max(200).when("create_follow_up_task", {
    is: true,
    then: Joi.required(),
    otherwise: Joi.forbidden().messages({ "any.unknown": "task_name is not allowed when not creating a follow-up task or for reply type" }),
  }).messages({
    "any.required": "task_name is required when creating a follow-up task",
  }),
  due_date: Joi.date().iso().when("create_follow_up_task", {
    is: true,
    then: Joi.required(),
    otherwise: Joi.forbidden().messages({ "any.unknown": "due_date is not allowed when not creating a follow-up task or for reply type" }),
  }).messages({
    "any.required": "due_date is required when creating a follow-up task",
  }),
  attach_file: Joi.any().optional(), // Handled by multer, but can be passed in req.file
  link_type: Joi.string().valid("Sales", "Lead", "Job", "General", "Construction", "Maintenance").optional(),
  note_type: Joi.string().valid("send", "reply").required().messages({
    "any.only": "note_type must be either 'send' or 'reply'",
    "any.required": "note_type is required",
  }),
  parent_note_id: Joi.string().uuid().when("note_type", {
    is: "reply",
    then: Joi.required().messages({ "any.required": "parent_note_id is required for reply type" }),
    otherwise: Joi.forbidden().messages({ "any.unknown": "parent_note_id is not allowed for send type" }),
  }).messages({
    "string.uuid": "parent_note_id must be a valid UUID",
  }),
});

export const updateNoteSchema = Joi.object({
  description: Joi.string().max(500).allow(null, "").optional(),
  note_tag_id: Joi.array().items(Joi.string().uuid()).optional(),
  send_to_customer: Joi.boolean().optional(),
  create_follow_up_task: Joi.boolean().optional(),
  attach_file: Joi.any().optional(),
  note_type: Joi.forbidden(),
  parent_note_id: Joi.forbidden(),
});

export const getAllNotesSchema = Joi.object({
  leads_id: Joi.string().uuid().optional(),
  job_id: Joi.string().uuid().optional(),
  link_type: Joi.string().max(255).allow(null, "").optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(25),
});

export const noteParamsSchema = Joi.object({
  notes_id: Joi.string().uuid().required().messages({
    "string.uuid": "notes_id must be a valid UUID",
    "any.required": "notes_id is required",
  }),
});

export default {
  createNoteSchema,
  updateNoteSchema,
  getAllNotesSchema,
  noteParamsSchema,
};
