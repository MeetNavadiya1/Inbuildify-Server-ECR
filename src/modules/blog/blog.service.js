import { Op } from "sequelize";

import db from "../../config/database/models/postgre-models/index.js";
import { httpError } from "../admin/admin.helper.js";
import { publicBlogPresenter } from "./blog.content.js";

/**
 * Only ever published articles. `is_active` is the whole access rule on this
 * side — there is no "preview" token and no way to ask for a draft, so a post
 * an admin has not toggled cannot be reached from the internet even by guessing
 * its slug.
 */
const LIVE = { is_active: true };

/**
 * Newest published first. `published_at` is when it went live, not when the row
 * was created, so re-editing an old article does not jump it to the top of the
 * blog; `created_at` only breaks ties.
 */
const NEWEST_FIRST = [
  ["published_at", "DESC"],
  ["created_at", "DESC"],
];

export const listPublicBlogPostsService = async ({ query = {} } = {}) => {
  const where = { ...LIVE };

  if (query.category && query.category !== "All") {
    where.category = query.category;
  }
  if (query.exclude_slug) {
    where.slug = { [Op.ne]: query.exclude_slug };
  }

  // The blog is a handful of articles, not a feed. A cap keeps a runaway query
  // off the landing page's server render without paginating something nobody
  // paginates.
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 100);

  const rows = await db.BlogPost.findAll({ where, order: NEWEST_FIRST, limit });

  return { items: rows.map(publicBlogPresenter), total: rows.length };
};

export const getPublicBlogPostService = async ({ slug }) => {
  const row = await db.BlogPost.findOne({ where: { ...LIVE, slug } });
  // 404, not 403, for a draft: the site's article page turns this into its own
  // not-found, and telling the internet that an unpublished article exists at
  // this URL is not the console's information to give away.
  if (!row) throw httpError(404, "Article not found.");
  return publicBlogPresenter(row);
};

export default {
  listPublicBlogPostsService,
  getPublicBlogPostService,
};
