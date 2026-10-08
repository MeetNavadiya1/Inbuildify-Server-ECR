import { Op } from "sequelize";

import db from "../../../config/database/models/postgre-models/index.js";
import { deleteFromS3 } from "../../../utils/s3Upload.js";
import { parsePagination, parseSort, withCamelAliases, listEnvelope, httpError } from "../admin.helper.js";
import {
  slugify,
  isSlugTaken,
  parseContentBlocks,
  estimateReadTime,
  formatDisplayDate,
} from "../../blog/blog.content.js";

export const BLOG_STAGES = ["live", "draft"];

export const BLOG_SORT_COLUMNS = withCamelAliases({
  title: "title",
  category: "category",
  created_at: "created_at",
  updated_at: "updated_at",
  published_at: "published_at",
});

/**
 * What the console shows. Everything the editor needs to reopen the post is
 * here — `content` above all, since `body` is a derived array nobody can edit by
 * hand — plus the two read-only dates the landing card would show.
 */
const presenter = (row) => ({
  blogPostId: row.blog_post_id,
  slug: row.slug,
  title: row.title,
  // Raw, so the editor reopens with exactly what was typed and shows the
  // fallback as a placeholder rather than as a value the admin has to keep.
  seoTitle: row.seo_title,
  description: row.description,
  excerpt: row.excerpt,
  category: row.category,
  readTime: row.read_time,
  // What the site will actually publish once the fallbacks are applied — the
  // same three the public presenter computes, so the console never claims a
  // page will render something the landing site would not.
  effective: {
    seoTitle: row.seo_title || row.title,
    description: row.description || row.excerpt || "",
    readTime: row.read_time || estimateReadTime(row.content),
  },
  keywords: Array.isArray(row.keywords) ? row.keywords : [],
  image: row.image,
  imageKey: row.image_key,
  content: row.content,
  body: Array.isArray(row.body) ? row.body : [],
  isActive: row.is_active,
  publishedAt: row.published_at,
  // What the card on the landing site will read, so the console shows the same
  // date the visitor will — not the row's created_at, which is usually earlier.
  displayDate: formatDisplayDate(row.published_at || row.createdAt),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/**
 * A slug the site can actually serve: derived from the title unless the admin
 * typed one, never colliding with another row or with a hard-coded article.
 *
 * `-2`, `-3` … is appended rather than rejecting the save. Two posts called
 * "Site safety" a year apart is normal editorial behaviour, and refusing the
 * second one teaches the admin nothing they can act on.
 */
const uniqueSlug = async (desired, title, excludeId = null) => {
  const base = slugify(desired || title) || "post";
  let candidate = base;

  for (let attempt = 2; attempt < 200; attempt += 1) {
    const clash = isSlugTaken(candidate)
      ? true
      : Boolean(
        await db.BlogPost.findOne({
          where: {
            slug: candidate,
            ...(excludeId ? { blog_post_id: { [Op.ne]: excludeId } } : {}),
          },
          attributes: ["blog_post_id"],
        }),
      );

    if (!clash) return candidate;
    candidate = `${base}-${attempt}`;
  }

  throw httpError(409, "Could not find a free URL for that title. Try a different one.");
};

const findOr404 = async (id) => {
  const row = await db.BlogPost.findByPk(id);
  if (!row) throw httpError(404, "That article no longer exists.");
  return row;
};

/**
 * The derived half of a post, computed from the values the row will actually
 * hold after the save — not from the patch, which may leave any of them out.
 * `body` is always re-parsed from `content`, so the two can never describe
 * different articles.
 *
 * The three optional SEO fields are stored **null when blank**, never
 * pre-filled with their fallback. Writing the fallback into the column would
 * freeze it: an admin who renames an article would keep the old `seo_title`
 * forever, because on the next save it would look like a value they had typed.
 * The fallback belongs at read time, and both presenters apply it.
 */
const derivedFields = ({ content, readTime, seoTitle, description }) => ({
  content,
  body: parseContentBlocks(content),
  read_time: readTime?.trim() || null,
  seo_title: seoTitle?.trim() || null,
  description: description?.trim() || null,
});

export const listBlogPostsService = async ({ query }) => {
  const { page, limit, offset } = parsePagination(query);
  const where = {};

  if (query.search) {
    const term = `%${String(query.search).trim()}%`;
    where[Op.or] = [
      { title: { [Op.iLike]: term } },
      { excerpt: { [Op.iLike]: term } },
      { slug: { [Op.iLike]: term } },
      { category: { [Op.iLike]: term } },
    ];
  }

  if (query.stage === "live") where.is_active = true;
  if (query.stage === "draft") where.is_active = false;
  if (query.category) where.category = query.category;

  const { rows, count } = await db.BlogPost.findAndCountAll({
    where,
    order: parseSort(query, BLOG_SORT_COLUMNS, "created_at"),
    limit,
    offset,
  });

  return listEnvelope(rows.map(presenter), count, page, limit);
};

export const getBlogPostStatsService = async () => {
  const [total, live, byCategoryRows] = await Promise.all([
    db.BlogPost.count(),
    db.BlogPost.count({ where: { is_active: true } }),
    db.BlogPost.findAll({
      attributes: ["category", [db.sequelize.fn("COUNT", db.sequelize.col("blog_post_id")), "count"]],
      group: ["category"],
      raw: true,
    }),
  ]);

  return {
    totals: { total, live, draft: total - live },
    byCategory: byCategoryRows
      .map((row) => ({ category: row.category, count: Number(row.count) }))
      .sort((a, b) => b.count - a.count),
  };
};

export const getBlogPostService = async ({ id }) => presenter(await findOr404(id));

export const createBlogPostService = async ({ body, admin }) => {
  const title = body.title.trim();
  const excerpt = body.excerpt?.trim() || null;
  const content = body.content ?? "";

  const row = await db.BlogPost.create({
    slug: await uniqueSlug(body.slug, title),
    title,
    excerpt,
    category: body.category,
    keywords: body.keywords || [],
    image: body.image || null,
    image_key: body.image_key || null,
    ...derivedFields({
      content,
      readTime: body.read_time,
      seoTitle: body.seo_title,
      description: body.description,
    }),
    // Never live on arrival, whatever the client sent. Publishing is a separate,
    // deliberate act on the list screen — see the model comment.
    is_active: false,
    published_at: null,
    created_by: admin?.platform_user_id || null,
    updated_by: admin?.platform_user_id || null,
  });

  return presenter(row);
};

export const updateBlogPostService = async ({ id, body, admin }) => {
  const row = await findOr404(id);

  // Every field resolves to "what the admin sent, else what the row already
  // holds", so a partial patch cannot blank a value it never mentioned.
  const resolve = (sent, current) => (sent !== undefined ? sent : current);

  const title = body.title !== undefined ? body.title.trim() : row.title;
  const excerpt = body.excerpt !== undefined ? body.excerpt?.trim() || null : row.excerpt;
  const content = resolve(body.content, row.content) ?? "";

  const patch = {
    title,
    excerpt,
    category: resolve(body.category, row.category),
    keywords: resolve(body.keywords, row.keywords) || [],
    ...derivedFields({
      content,
      readTime: resolve(body.read_time, row.read_time),
      seoTitle: resolve(body.seo_title, row.seo_title),
      description: resolve(body.description, row.description),
    }),
    updated_by: admin?.platform_user_id || null,
  };

  // A slug change breaks every link to the article that is already out there, so
  // it only moves when the admin edits the field itself — retitling a live post
  // leaves its URL alone.
  if (body.slug !== undefined && slugify(body.slug) !== row.slug) {
    patch.slug = await uniqueSlug(body.slug, title, row.blog_post_id);
  }

  // The old object is deleted only once the row no longer points at it, so a
  // failed save can never leave a live post with a missing image.
  const previousKey = row.image_key;
  const replacingImage = body.image !== undefined && body.image !== row.image;

  if (body.image !== undefined) {
    patch.image = body.image || null;
    patch.image_key = body.image_key || null;
  }

  await row.update(patch);

  if (replacingImage && previousKey && previousKey !== patch.image_key) {
    await deleteFromS3(previousKey);
  }

  return presenter(row);
};

/**
 * The toggle on the list screen — the only thing between a draft and the public
 * site.
 *
 * `published_at` is stamped the first time a post goes live and never touched
 * again: unpublishing to fix a typo and republishing must not move the article
 * to the top of the blog with today's date on it.
 */
export const setBlogPostActiveService = async ({ id, isActive, admin }) => {
  const row = await findOr404(id);

  if (isActive && !row.image) {
    throw httpError(422, "Add a cover image before publishing — the blog card cannot render without one.");
  }
  if (isActive && (!Array.isArray(row.body) || row.body.length === 0)) {
    throw httpError(422, "This article has no content yet. Write the body before publishing.");
  }

  await row.update({
    is_active: isActive,
    published_at: isActive && !row.published_at ? new Date() : row.published_at,
    updated_by: admin?.platform_user_id || null,
  });

  return presenter(row);
};

export const deleteBlogPostService = async ({ id }) => {
  const row = await findOr404(id);
  const { image_key: imageKey, slug } = row;

  await row.destroy();
  // After the row is gone: an orphaned S3 object is a tidiness problem, a
  // deleted object under a row that survived is a broken article.
  if (imageKey) await deleteFromS3(imageKey);

  return { blogPostId: id, slug };
};

export default {
  listBlogPostsService,
  getBlogPostStatsService,
  getBlogPostService,
  createBlogPostService,
  updateBlogPostService,
  setBlogPostActiveService,
  deleteBlogPostService,
};
