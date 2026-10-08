import Joi from "joi";

import { APPROVAL_STATUSES, FEATURED_FACADE_SORT_COLUMNS } from "./admin-featured-facade.service.js";

export const listFeaturedFacadeRequestsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(25),
  search: Joi.string().trim().allow("").optional(),
  status: Joi.string().valid(...APPROVAL_STATUSES).allow("").optional(),
  company_id: Joi.string().uuid().optional(),
  from: Joi.date().iso().optional(),
  to: Joi.date().iso().optional(),
  sort_by: Joi.string().valid(...Object.keys(FEATURED_FACADE_SORT_COLUMNS)).optional(),
  sort_dir: Joi.string().valid("asc", "desc").optional(),
});

export const featuredFacadeIdSchema = Joi.object({
  featur_facade_id: Joi.string().uuid().required(),
});

/**
 * Featuring straight from the console. Both dates are required for the same
 * reason the CRM's own form requires them — the window is what takes a facade
 * back off the landing page, and a promotion with no end never does.
 *
 * The tenant is not accepted: it is read off the facade, so an admin cannot
 * anchor a promotion to a builder who does not own the photograph.
 */
export const createFeaturedFacadeSchema = Joi.object({
  facade_id: Joi.string().uuid().required(),
  start_date: Joi.date().iso().required(),
  end_date: Joi.date().iso().required(),
  is_active: Joi.boolean().default(true),
  review_note: Joi.string().max(2000).optional().allow(null, ""),
});

/**
 * The carousel's running order, first to last.
 *
 * The whole strip is sent every time rather than "move this one to position 4":
 * two admins reordering at once would otherwise interleave into an order
 * neither of them chose, and the service rejects a list that no longer matches
 * what is live. 100 is the cap because that is what the ordering screen reads.
 */
export const reorderFeaturedFacadesSchema = Joi.object({
  order: Joi.array().items(Joi.string().uuid()).min(1).max(100).required(),
});

/**
 * The note is what the builder is told, so it is worth writing on a rejection —
 * but it is not required. A request refused because the facade is nothing to do
 * with inBuildify's market needs no explanation typed twice.
 */
export const featuredFacadeReviewSchema = Joi.object({
  review_note: Joi.string().max(2000).optional().allow(null, ""),
});

export default {
  listFeaturedFacadeRequestsSchema,
  featuredFacadeIdSchema,
  createFeaturedFacadeSchema,
  reorderFeaturedFacadesSchema,
  featuredFacadeReviewSchema,
};
