import Joi from "joi";

export const getAllWorkFlowProcessTaskSchema = Joi.object({
  limit: Joi.number().optional().default(25).max(25),
  offset: Joi.number().optional().default(0).max(25),
  workflow_process_id: Joi.string().uuid().required().messages({
    "string.guid": "Workflow Process ID must be a valid UUID",
    "any.required": "Workflow Process ID is required",
  }),
  lead_id: Joi.string().uuid().required().messages({
    "string.guid": "Lead ID must be a valid UUID",
    "any.required": "Lead ID is required",
  }),
});

export const deleteWorkFlowProcessTaskSchema = Joi.object({
  action_id: Joi.string().uuid().required().messages({
    "string.guid": "Action ID must be a valid UUID",
    "any.required": "Action ID is required",
  }),
});

export default {
  getAllWorkFlowProcessTaskSchema,
  deleteWorkFlowProcessTaskSchema,
};
