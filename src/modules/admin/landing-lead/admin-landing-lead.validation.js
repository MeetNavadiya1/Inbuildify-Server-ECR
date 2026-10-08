import Joi from "joi";

import { LANDING_STAGES, LANDING_SORT_COLUMNS } from "./admin-landing-lead.service.js";

export const listLandingLeadsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(25),
  search: Joi.string().trim().allow("").optional(),
  stage: Joi.string().valid(...LANDING_STAGES).allow("").optional(),
  builder_id: Joi.string().uuid().optional(),
  company_id: Joi.string().uuid().optional(),
  source: Joi.string().trim().max(50).optional(),
  from: Joi.date().iso().optional(),
  to: Joi.date().iso().optional(),
  sort_by: Joi.string().valid(...Object.keys(LANDING_SORT_COLUMNS)).optional(),
  sort_dir: Joi.string().valid("asc", "desc").optional(),
});

export const landingLeadStatsSchema = Joi.object({
  builder_id: Joi.string().uuid().optional(),
  company_id: Joi.string().uuid().optional(),
});

export const landingLeadIdSchema = Joi.object({
  landing_lead_id: Joi.string().uuid().required(),
});

export const releaseLandingLeadSchema = Joi.object({
  // Absent means "the builder whose facade was clicked" — the row already knows.
  builder_id: Joi.string().uuid().optional().allow(null),
  company_id: Joi.string().uuid().optional().allow(null),
  released_to_email: Joi.string().email().max(255).optional().allow(null, ""),
  // Details the enquiry itself is missing — the landing form makes phone
  // optional while a builder's Sales settings may require it.
  lead_email: Joi.string().email().max(255).optional().allow(null, ""),
  lead_phone: Joi.string().min(10).max(14).optional().allow(null, ""),
  release_amount: Joi.number().min(0).precision(2).optional().allow(null),
  release_currency: Joi.string().length(3).uppercase().optional(),
  release_method: Joi.string().valid("email", "manual", "phone").optional(),
  admin_notes: Joi.string().max(2000).optional().allow(null, ""),
  send_email: Joi.boolean().optional(),
});

export const rejectLandingLeadSchema = Joi.object({
  admin_notes: Joi.string().max(2000).optional().allow(null, ""),
});

export default {
  listLandingLeadsSchema,
  landingLeadStatsSchema,
  landingLeadIdSchema,
  releaseLandingLeadSchema,
  rejectLandingLeadSchema,
};
