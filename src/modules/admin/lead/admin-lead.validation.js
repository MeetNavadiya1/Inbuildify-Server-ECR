import Joi from "joi";

import { LEAD_OUTCOMES, LEAD_SCOPES, LEAD_SORT_COLUMNS } from "./admin-lead.service.js";

const listKeys = {
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(25),
  search: Joi.string().trim().allow("").optional(),
  company_id: Joi.string().uuid().optional(),
  lead_source_id: Joi.string().uuid().optional(),
  rating: Joi.string().trim().max(50).optional(),
  status: Joi.string().trim().max(20).optional(),
  from: Joi.date().iso().optional(),
  to: Joi.date().iso().optional(),
  sort_by: Joi.string().valid(...Object.keys(LEAD_SORT_COLUMNS)).optional(),
  sort_dir: Joi.string().valid("asc", "desc").optional(),
};

export const listLeadsSchema = Joi.object({
  ...listKeys,
  outcome: Joi.string().valid(...LEAD_OUTCOMES).optional(),
  scope: Joi.string().valid(...LEAD_SCOPES).optional(),
});

export const listClientsSchema = Joi.object(listKeys);

export const leadStatsSchema = Joi.object({
  company_id: Joi.string().uuid().optional(),
  scope: Joi.string().valid(...LEAD_SCOPES).optional(),
});

export default { listLeadsSchema, listClientsSchema, leadStatsSchema };
