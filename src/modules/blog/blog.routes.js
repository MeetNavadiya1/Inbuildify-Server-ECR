import express from "express";

import { listPublicBlogPosts, getPublicBlogPost } from "./blog.controller.js";

const router = express.Router();

/**
 * The landing site's blog, read side.
 *
 * Unauthenticated on purpose, like `/featur-facade` — these are the marketing
 * pages themselves. The landing site renders them on the server for crawlers, so
 * putting a rotating `X-Secure-Access` token in front would buy nothing (the
 * content is public the moment it renders) and cost the ability to fetch it from
 * a static build or a preview deploy.
 *
 * Everything here filters on `is_active`, so only articles an admin has
 * published are reachable. No route on this router can write.
 */
router.get("/", listPublicBlogPosts);
router.get("/:slug", getPublicBlogPost);

export default router;
