import Joi from "joi";

const MAX_MESSAGE_LENGTH = 2000;

// The URL segment is lower-case (/chat/lead/:id, /chat/job/:id); the service
// works in the stored upper-case form.
export const chatEntityParamsSchema = Joi.object({
  entity_type: Joi.string()
    .lowercase()
    .valid("lead", "job")
    .required()
    .messages({ "any.only": "entity_type must be either 'lead' or 'job'" }),
  entity_id: Joi.string().uuid().required().messages({
    "string.uuid": "entity_id must be a valid UUID",
    "any.required": "entity_id is required",
  }),
});

export const getMessagesQuerySchema = Joi.object({
  after: Joi.date().iso().optional(),
  before: Joi.date().iso().optional(),
  limit: Joi.number().integer().min(1).max(100).default(30),
}).oxor("after", "before");

// JSON or multipart. Text may be empty when files are attached; the service
// rejects a message that has neither.
export const sendMessageSchema = Joi.object({
  body: Joi.string().trim().max(MAX_MESSAGE_LENGTH).allow("").default("").messages({
    "string.max": `Message must be at most ${MAX_MESSAGE_LENGTH} characters`,
  }),
});

// S Drive files to attach. Multipart carries it as one JSON-encoded field.
export const driveFileIdsSchema = Joi.array()
  .items(Joi.string().uuid().messages({ "string.guid": "drive_file_ids must contain valid UUIDs" }))
  .unique()
  .max(5)
  .default([])
  .messages({ "array.max": "You can attach at most 5 files per message." });

export const listConversationsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(25),
  search: Joi.string().trim().max(100).allow("").optional(),
});

export default {
  chatEntityParamsSchema,
  getMessagesQuerySchema,
  sendMessageSchema,
  driveFileIdsSchema,
  listConversationsQuerySchema,
};
