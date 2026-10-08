import Joi from "joi";

import { SIGNUP_STAGES, SIGNUP_SORT_COLUMNS } from "./admin-signup-request.service.js";

export const listSignupRequestsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(25),
  search: Joi.string().trim().allow("").optional(),
  stage: Joi.string().valid(...SIGNUP_STAGES).allow("").optional(),
  source: Joi.string().trim().max(50).optional(),
  from: Joi.date().iso().optional(),
  to: Joi.date().iso().optional(),
  sort_by: Joi.string().valid(...Object.keys(SIGNUP_SORT_COLUMNS)).optional(),
  sort_dir: Joi.string().valid("asc", "desc").optional(),
});

export const signupRequestIdSchema = Joi.object({
  landing_lead_id: Joi.string().uuid().required(),
});

export const releaseSignupRequestSchema = Joi.object({
  // The public form does not ask for a company name — the admin names the
  // tenant here. Absent falls back to the person's own name, which they can
  // correct on the onboarding form that opens at their first sign-in.
  company_name: Joi.string().trim().min(2).max(150).optional().allow(null, ""),
  // Where the credentials go. Absent means the address on the request.
  released_to_email: Joi.string().email().max(255).optional().allow(null, ""),
  admin_notes: Joi.string().max(2000).optional().allow(null, ""),
  send_email: Joi.boolean().optional(),
});

export const rejectSignupRequestSchema = Joi.object({
  admin_notes: Joi.string().max(2000).optional().allow(null, ""),
});

export default {
  listSignupRequestsSchema,
  signupRequestIdSchema,
  releaseSignupRequestSchema,
  rejectSignupRequestSchema,
};
