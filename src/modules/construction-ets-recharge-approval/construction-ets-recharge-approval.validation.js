import Joi from "joi";

export const createConstructionEtsRechargeApprovalValidation = Joi.object({
  role_id: Joi.string().uuid().required().messages({
    "string.uuid": "Role ID must be a valid UUID",
    "any.required": "Role ID is required",
  }),
  amount: Joi.number().positive().required().messages({
    "number.positive": "Amount must be a positive number",
    "any.required": "Amount is required",
  }),
});

export const updateConstructionEtsRechargeApprovalValidation = Joi.object({
  role_id: Joi.string().uuid().optional().messages({
    "string.uuid": "Role ID must be a valid UUID",
  }),
  amount: Joi.number().positive().optional().messages({
    "number.positive": "Amount must be a positive number",
  }),
}).min(1);

export const getConstructionEtsRechargeApprovalByIdValidation = Joi.object({
  construction_ets_recharge_approval_id: Joi.string().uuid().required().messages({
    "string.uuid": "Construction ETS recharge approval ID must be a valid UUID",
    "any.required": "Construction ETS recharge approval ID is required",
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
  construction_ets_recharge_id: Joi.string().uuid().optional().messages({
    "string.uuid": "Construction ETS recharge ID must be a valid UUID",
  }),
  role_id: Joi.string().uuid().optional().messages({
    "string.uuid": "Role ID must be a valid UUID",
  }),
});

export default {
  createConstructionEtsRechargeApprovalValidation,
  updateConstructionEtsRechargeApprovalValidation,
  getConstructionEtsRechargeApprovalByIdValidation,
  queryValidation,
};
