/**
 * Everything both blog modules need: the admin one that writes posts and the
 * public one the landing site reads. Kept out of either so the parse that turns
 * an admin's typing into blocks and the shape the site receives are defined once.
 */

/**
 * Slugs owned by the six hard-coded articles in the landing repo
 * (`src/content/blog.ts`). A database post may not take one of these: the
 * landing page renders the static list first, so a duplicate slug would be a row
 * that exists in the console, reports itself live, and is unreachable on the
 * site — the worst kind of bug to be told about.
 *
 * Keep in sync if a static article is ever added or removed.
 */
export const STATIC_BLOG_SLUGS = [
  "why-australian-builders-need-a-construction-crm",
  "construction-technology-trends-australia-2026",
  "managing-multiple-building-jobs-at-once",
  "keeping-building-clients-updated",
  "common-job-management-mistakes-builders",
  "construction-site-schedule-australia",
];

/** Reserved by the routes themselves — a post at /blog/page would shadow one. */
const RESERVED_SLUGS = ["page", "new", "admin", "api", "feed", "rss", "sitemap"];

export const slugify = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200)
    .replace(/-+$/g, "");

export const isSlugTaken = (slug) =>
  STATIC_BLOG_SLUGS.includes(slug) || RESERVED_SLUGS.includes(slug);

/**
 * Light markdown -> the block array the landing article page already renders.
 * Nothing here is a general markdown implementation on purpose: the renderer on
 * the other side understands exactly six block types, so parsing anything else
 * would produce output it cannot draw.
 *
 *   ## Heading          -> h2
 *   ### Heading         -> h3
 *   - item / * item     -> ul   (consecutive lines collect into one list)
 *   1. item             -> ol   (same)
 *   > text              -> quote
 *   anything else       -> p    (consecutive lines join into one paragraph)
 *
 * A blank line ends whatever is open. Unparseable input degrades to paragraphs
 * rather than throwing — a half-written draft still has to save.
 */
export const parseContentBlocks = (content) => {
  const lines = String(content || "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];

  let list = null; // { type: "ul" | "ol", items: [] }
  let paragraph = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const text = paragraph.join(" ").trim();
    if (text) blocks.push({ type: "p", text });
    paragraph = [];
  };

  const flushList = () => {
    if (!list) return;
    if (list.items.length) blocks.push({ type: list.type, items: list.items });
    list = null;
  };

  const flushAll = () => {
    flushParagraph();
    flushList();
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushAll();
      continue;
    }

    const heading = line.match(/^(#{2,3})\s+(.*)$/);
    if (heading) {
      flushAll();
      const text = heading[2].trim();
      if (text) blocks.push({ type: heading[1].length === 2 ? "h2" : "h3", text });
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      flushAll();
      const text = quote[1].trim();
      if (text) blocks.push({ type: "quote", text });
      continue;
    }

    const bullet = line.match(/^[-*•]\s+(.*)$/);
    if (bullet) {
      flushParagraph();
      if (list?.type !== "ul") {
        flushList();
        list = { type: "ul", items: [] };
      }
      const item = bullet[1].trim();
      if (item) list.items.push(item);
      continue;
    }

    const numbered = line.match(/^\d+[.)]\s+(.*)$/);
    if (numbered) {
      flushParagraph();
      if (list?.type !== "ol") {
        flushList();
        list = { type: "ol", items: [] };
      }
      const item = numbered[1].trim();
      if (item) list.items.push(item);
      continue;
    }

    // A plain line while a list is open closes the list — a paragraph between
    // two bullet groups is a paragraph, not a third bullet.
    flushList();
    paragraph.push(line);
  }

  flushAll();
  return blocks;
};

/** Words a reader gets through in a minute. The number every "N min read" uses. */
const WORDS_PER_MINUTE = 200;

export const estimateReadTime = (content) => {
  const words = String(content || "").trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / WORDS_PER_MINUTE));
  return `${minutes} min read`;
};

/** "15 May 2026" — what the card shows, formatted the way the static posts are. */
export const formatDisplayDate = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
};

const isoOf = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
};

/**
 * The shape the landing site consumes. Deliberately the same field names as the
 * static `BlogPost` type in the landing repo, so the two lists concatenate with
 * no adapter in between — `date`/`isoDate`/`readTime` are derived here rather
 * than left for the site to compute twice.
 *
 * `seoTitle` and `description` fall back so no page ever renders a blank <title>
 * or meta description; `source: "dynamic"` lets the site tell a database post
 * from a hard-coded one when it needs to (it mostly does not).
 */
export const publicBlogPresenter = (row) => {
  const publishedAt = row.published_at || row.createdAt || row.created_at;
  const updatedAt = row.updatedAt || row.updated_at || publishedAt;

  return {
    slug: row.slug,
    title: row.title,
    seoTitle: row.seo_title || row.title,
    description: row.description || row.excerpt || "",
    excerpt: row.excerpt || "",
    date: formatDisplayDate(publishedAt),
    isoDate: isoOf(publishedAt),
    updatedIso: isoOf(updatedAt),
    readTime: row.read_time || estimateReadTime(row.content),
    category: row.category,
    keywords: Array.isArray(row.keywords) ? row.keywords : [],
    image: row.image || null,
    body: Array.isArray(row.body) ? row.body : [],
    source: "dynamic",
  };
};

export default {
  STATIC_BLOG_SLUGS,
  slugify,
  isSlugTaken,
  parseContentBlocks,
  estimateReadTime,
  formatDisplayDate,
  publicBlogPresenter,
};
