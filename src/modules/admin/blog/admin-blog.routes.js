import express from "express";

import {
  listBlogPosts,
  getBlogPostStats,
  getBlogPost,
  createBlogPost,
  updateBlogPost,
  setBlogPostActive,
  deleteBlogPost,
  uploadBlogImage,
  deleteBlogImage,
} from "./admin-blog.controller.js";
import {
  listBlogPostsSchema,
  blogPostIdSchema,
  createBlogPostSchema,
  updateBlogPostSchema,
  toggleBlogPostSchema,
} from "./admin-blog.validation.js";
import { validateRequest } from "../../../middleware/validateRequestMiddleware.js";
import { requireAdminPermission, ADMIN_PERMISSIONS } from "../../../middleware/adminPermissionMiddleware.js";
import { createImageUpload, handleMulterError } from "../../../utils/s3Upload.js";
import { REQUEST_SOURCE } from "../../../config/constants.js";

export const blogRouter = express.Router();

// Same S3 helper every other image on the platform goes through: the shared
// client with its keep-alive pool, the image-only filter, and the configured
// size limit. "blog" is the key prefix, which is also what the delete route
// checks before it removes anything.
const upload = createImageUpload("blog");

blogRouter.get(
  "/stats",
  requireAdminPermission(ADMIN_PERMISSIONS.BLOG_READ),
  getBlogPostStats,
);

blogRouter.get(
  "/",
  requireAdminPermission(ADMIN_PERMISSIONS.BLOG_READ),
  validateRequest(listBlogPostsSchema, REQUEST_SOURCE.QUERY),
  listBlogPosts,
);

/**
 * Cover image upload. Sits above `/:blog_post_id` so "image" is never read as an
 * id, and carries the write permission — an upload puts a file in the bucket.
 */
blogRouter.post(
  "/image",
  requireAdminPermission(ADMIN_PERMISSIONS.BLOG_WRITE),
  upload.single("image"),
  handleMulterError,
  uploadBlogImage,
);

blogRouter.delete(
  "/image",
  requireAdminPermission(ADMIN_PERMISSIONS.BLOG_WRITE),
  deleteBlogImage,
);

blogRouter.post(
  "/",
  requireAdminPermission(ADMIN_PERMISSIONS.BLOG_WRITE),
  validateRequest(createBlogPostSchema, REQUEST_SOURCE.BODY),
  createBlogPost,
);

blogRouter.get(
  "/:blog_post_id",
  requireAdminPermission(ADMIN_PERMISSIONS.BLOG_READ),
  validateRequest(blogPostIdSchema, REQUEST_SOURCE.PARAMS),
  getBlogPost,
);

blogRouter.put(
  "/:blog_post_id",
  requireAdminPermission(ADMIN_PERMISSIONS.BLOG_WRITE),
  validateRequest(blogPostIdSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateBlogPostSchema, REQUEST_SOURCE.BODY),
  updateBlogPost,
);

/**
 * The publish switch. Its own endpoint rather than a field on the update, so
 * putting an article in front of the public is one deliberate call that cannot
 * happen as a side effect of saving a typo fix.
 */
blogRouter.patch(
  "/:blog_post_id/active",
  requireAdminPermission(ADMIN_PERMISSIONS.BLOG_WRITE),
  validateRequest(blogPostIdSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(toggleBlogPostSchema, REQUEST_SOURCE.BODY),
  setBlogPostActive,
);

blogRouter.delete(
  "/:blog_post_id",
  requireAdminPermission(ADMIN_PERMISSIONS.BLOG_WRITE),
  validateRequest(blogPostIdSchema, REQUEST_SOURCE.PARAMS),
  deleteBlogPost,
);

export default blogRouter;
