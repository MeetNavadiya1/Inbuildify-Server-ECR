import Joi from "joi";

import { BLOG_CATEGORIES } from "../../../config/database/models/postgre-models/blog-post.model.js";
import { BLOG_STAGES, BLOG_SORT_COLUMNS } from "./admin-blog.service.js";

export const listBlogPostsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(25),
  search: Joi.string().trim().allow("").optional(),
  stage: Joi.string().valid(...BLOG_STAGES).allow("").optional(),
  category: Joi.string().valid(...BLOG_CATEGORIES).allow("").optional(),
  sort_by: Joi.string().valid(...Object.keys(BLOG_SORT_COLUMNS)).optional(),
  sort_dir: Joi.string().valid("asc", "desc").optional(),
});

export const blogPostIdSchema = Joi.object({
  blog_post_id: Joi.string().uuid().required(),
});

/**
 * The writable half of a post. `is_active` and `published_at` are deliberately
 * absent: a post is published by the toggle endpoint alone, so no save — not
 * even a hand-rolled one — can put an unreviewed draft on the public site.
 */
const postFields = {
  title: Joi.string().trim().min(3).max(255),
  // Optional: left blank, the service derives it from the title.
  slug: Joi.string().trim().max(200).allow("", null),
  seo_title: Joi.string().trim().max(255).allow("", null),
  description: Joi.string().trim().max(500).allow("", null),
  excerpt: Joi.string().trim().max(500).allow("", null),
  category: Joi.string().valid(...BLOG_CATEGORIES),
  read_time: Joi.string().trim().max(30).allow("", null),
  keywords: Joi.array().items(Joi.string().trim().max(120)).max(20),
  // The S3 URL and object key returned by POST /admin/blog/image. The pair is
  // written together so a row can never point at a file it cannot later delete.
  image: Joi.string().trim().uri().max(1000).allow("", null),
  image_key: Joi.string().trim().max(1000).allow("", null),
  content: Joi.string().allow("").max(120000),
};

export const createBlogPostSchema = Joi.object({
  ...postFields,
  title: postFields.title.required(),
  category: postFields.category.default(BLOG_CATEGORIES[0]),
  content: postFields.content.default(""),
});

// Every field optional — the editor sends the whole form, but a caller patching
// one field should not have to resend the article.
export const updateBlogPostSchema = Joi.object(postFields).min(1);

export const toggleBlogPostSchema = Joi.object({
  is_active: Joi.boolean().required(),
});

export default {
  listBlogPostsSchema,
  blogPostIdSchema,
  createBlogPostSchema,
  updateBlogPostSchema,
  toggleBlogPostSchema,
};
