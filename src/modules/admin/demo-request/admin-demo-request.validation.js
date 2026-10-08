import Joi from "joi";

import { DEMO_STAGES, DEMO_SORT_COLUMNS } from "./admin-demo-request.service.js";

export const listDemoRequestsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(25),
  search: Joi.string().trim().allow("").optional(),
  stage: Joi.string().valid(...DEMO_STAGES).allow("").optional(),
  source: Joi.string().trim().max(50).optional(),
  company_type: Joi.string().trim().max(60).optional(),
  from: Joi.date().iso().optional(),
  to: Joi.date().iso().optional(),
  sort_by: Joi.string().valid(...Object.keys(DEMO_SORT_COLUMNS)).optional(),
  sort_dir: Joi.string().valid("asc", "desc").optional(),
});

export const demoRequestIdSchema = Joi.object({
  landing_lead_id: Joi.string().uuid().required(),
});

export const demoRequestNotesSchema = Joi.object({
  admin_notes: Joi.string().max(2000).optional().allow(null, ""),
});

export default {
  listDemoRequestsSchema,
  demoRequestIdSchema,
  demoRequestNotesSchema,
};
