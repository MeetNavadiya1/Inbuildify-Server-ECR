import express from "express";

import {
  listFeaturedFacadeRequests,
  getFeaturedFacadeStats,
  getLandingOrder,
  reorderFeaturedFacades,
  createFeaturedFacade,
  approveFeaturedFacadeRequest,
  rejectFeaturedFacadeRequest,
  reopenFeaturedFacadeRequest,
  removeFeaturedFacade,
} from "./admin-featured-facade.controller.js";
import {
  listFeaturedFacadeRequestsSchema,
  featuredFacadeIdSchema,
  createFeaturedFacadeSchema,
  reorderFeaturedFacadesSchema,
  featuredFacadeReviewSchema,
} from "./admin-featured-facade.validation.js";
import { validateRequest } from "../../../middleware/validateRequestMiddleware.js";
import { requireAdminPermission, ADMIN_PERMISSIONS } from "../../../middleware/adminPermissionMiddleware.js";
import { REQUEST_SOURCE } from "../../../config/constants.js";

export const featuredFacadeRouter = express.Router();

featuredFacadeRouter.get(
  "/stats",
  requireAdminPermission(ADMIN_PERMISSIONS.FEATURED_FACADE_READ),
  getFeaturedFacadeStats,
);

featuredFacadeRouter.get(
  "/",
  requireAdminPermission(ADMIN_PERMISSIONS.FEATURED_FACADE_READ),
  validateRequest(listFeaturedFacadeRequestsSchema, REQUEST_SOURCE.QUERY),
  listFeaturedFacadeRequests,
);

// The carousel as it stands, in the order visitors see it. Literal paths are
// declared before `/:featur_facade_id` routes so "order" is never read as an id.
featuredFacadeRouter.get(
  "/order",
  requireAdminPermission(ADMIN_PERMISSIONS.FEATURED_FACADE_READ),
  getLandingOrder,
);

// Reordering is a publish, not a preference: it changes what the first visitor
// to the site sees next. Hence the review permission rather than the read one.
featuredFacadeRouter.put(
  "/order",
  requireAdminPermission(ADMIN_PERMISSIONS.FEATURED_FACADE_REVIEW),
  validateRequest(reorderFeaturedFacadesSchema, REQUEST_SOURCE.BODY),
  reorderFeaturedFacades,
);

// Featuring a facade from the console, with no builder request behind it. Same
// permission as approving one, because it is the same act: something goes on
// the public landing page because an admin said so.
featuredFacadeRouter.post(
  "/",
  requireAdminPermission(ADMIN_PERMISSIONS.FEATURED_FACADE_REVIEW),
  validateRequest(createFeaturedFacadeSchema, REQUEST_SOURCE.BODY),
  createFeaturedFacade,
);

// Approving puts a builder's facade on inBuildify's own landing page — the
// furthest-reaching mutation on this router after publishing a blog post, and
// the reason review sits behind its own permission rather than the read.
featuredFacadeRouter.post(
  "/:featur_facade_id/approve",
  requireAdminPermission(ADMIN_PERMISSIONS.FEATURED_FACADE_REVIEW),
  validateRequest(featuredFacadeIdSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(featuredFacadeReviewSchema, REQUEST_SOURCE.BODY),
  approveFeaturedFacadeRequest,
);

featuredFacadeRouter.post(
  "/:featur_facade_id/reject",
  requireAdminPermission(ADMIN_PERMISSIONS.FEATURED_FACADE_REVIEW),
  validateRequest(featuredFacadeIdSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(featuredFacadeReviewSchema, REQUEST_SOURCE.BODY),
  rejectFeaturedFacadeRequest,
);

featuredFacadeRouter.post(
  "/:featur_facade_id/reopen",
  requireAdminPermission(ADMIN_PERMISSIONS.FEATURED_FACADE_REVIEW),
  validateRequest(featuredFacadeIdSchema, REQUEST_SOURCE.PARAMS),
  reopenFeaturedFacadeRequest,
);

// Take it off the site and close the request out. Unlike reopen, which parks a
// builder's request back in the queue for somebody to look at again, this ends
// it — and frees the facade to be featured from scratch.
featuredFacadeRouter.delete(
  "/:featur_facade_id",
  requireAdminPermission(ADMIN_PERMISSIONS.FEATURED_FACADE_REVIEW),
  validateRequest(featuredFacadeIdSchema, REQUEST_SOURCE.PARAMS),
  removeFeaturedFacade,
);

export default featuredFacadeRouter;
