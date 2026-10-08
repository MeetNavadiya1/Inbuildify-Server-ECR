import Joi from "joi";

export const createConstructionChecklistPredecessorValidation = Joi.object({
  construction_checklist_id: Joi.string().uuid().required().messages({
    "string.uuid": "Construction checklist ID must be a valid UUID",
    "any.required": "Construction checklist ID is required",
  }),
  predecessor_checklist_id: Joi.string().uuid().required().allow(null).messages({
    "string.uuid": "Predecessor checklist ID must be a valid UUID",
  }),
  offset: Joi.boolean().optional().messages({
    "boolean.base": "Offset must be a boolean",
  }),
  duration: Joi.number().integer().optional().messages({
    "number.integer": "Duration must be an integer",
  }),
});

export const updateConstructionChecklistPredecessorValidation = Joi.object({
  predecessor_checklist_id: Joi.string().uuid().optional().allow(null).messages({
    "string.uuid": "Predecessor checklist ID must be a valid UUID",
  }),
  offset: Joi.boolean().optional().messages({
    "boolean.base": "Offset must be a boolean",
  }),
  duration: Joi.number().integer().optional().messages({
    "number.integer": "Duration must be an integer",
  }),
}).min(1);

export const getConstructionChecklistPredecessorByIdValidation = Joi.object({
  construction_checklist_predecessor_id: Joi.string().uuid().required().messages({
    "string.uuid": "Construction checklist predecessor ID must be a valid UUID",
    "any.required": "Construction checklist predecessor ID is required",
  }),
});

export const queryValidation = Joi.object({
  page: Joi.number().integer().min(1).optional().messages({
    "number.integer": "Page must be an integer",
    "number.min": "Page must be at least 1",
  }),
  limit: Joi.number().integer().min(1).max(100).optional().messages({
    "number.integer": "Limit must be an integer",
    "number.min": "Limit must be at least 1",
    "number.max": "Limit must be at most 100",
  }),
  construction_checklist_id: Joi.string().uuid().optional().messages({
    "string.uuid": "Construction checklist ID must be a valid UUID",
  }),
  predecessor_checklist_id: Joi.string().uuid().optional().messages({
    "string.uuid": "Predecessor checklist ID must be a valid UUID",
  }),
  offset: Joi.boolean().optional().messages({
    "boolean.base": "Offset must be a boolean",
  }),
  duration: Joi.number().integer().optional().messages({
    "number.integer": "Duration must be an integer",
  }),
});

export default {
  createConstructionChecklistPredecessorValidation,
  updateConstructionChecklistPredecessorValidation,
  getConstructionChecklistPredecessorByIdValidation,
  queryValidation,
};
