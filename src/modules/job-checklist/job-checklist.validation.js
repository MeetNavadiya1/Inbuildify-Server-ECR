import Joi from "joi";

const uuid = Joi.string().uuid().required();

export const jobParamsSchema = Joi.object({
  job_id: uuid.messages({ "string.guid": "job_id must be a valid UUID" }),
});

export const itemParamsSchema = Joi.object({
  item_id: uuid.messages({ "string.guid": "item_id must be a valid UUID" }),
});

export const listQuerySchema = Joi.object({
  // Mirrors the drawer's All / Pending / Completed tabs.
  status: Joi.string().valid("all", "pending", "completed").default("all"),
}).unknown(false);

export const addItemSchema = Joi.object({
  description: Joi.string().trim().max(500).required(),
  notes: Joi.boolean().default(false),
  is_required: Joi.boolean().default(false),
  type: Joi.string().valid("checkbox", "dropdown").default("checkbox"),
  sort: Joi.number().integer().min(1).optional(),
});

export const applyTemplateSchema = Joi.object({
  checklist_id: uuid.messages({ "string.guid": "checklist_id must be a valid UUID" }),
});

export const updateItemSchema = Joi.object({
  description: Joi.string().trim().max(500).optional(),
  notes: Joi.boolean().optional(),
  is_required: Joi.boolean().optional(),
  type: Joi.string().valid("checkbox", "dropdown").optional(),
  sort: Joi.number().integer().min(1).optional(),
}).min(1);

// response accepts the checkbox's boolean, the dropdown's Yes/No/N/A, or null
// to clear the answer and send the line back to Pending.
export const setResponseSchema = Joi.object({
  response: Joi.alternatives()
    .try(Joi.boolean(), Joi.string().allow(null, ""))
    .optional(),
  note: Joi.string().allow(null, "").max(500).optional(),
}).min(1);

export default {
  jobParamsSchema,
  itemParamsSchema,
  listQuerySchema,
  addItemSchema,
  applyTemplateSchema,
  updateItemSchema,
  setResponseSchema,
};
