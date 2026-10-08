import { Model, DataTypes } from "sequelize";

/**
 * An article on the landing site's /blog ("Builder Notes").
 *
 * The six original posts are hard-coded in the landing repo (`src/content/blog.ts`)
 * and stay there — they are the SEO pages the site was built around and nothing
 * here replaces them. This table is the *second* source: anything an admin writes
 * in the console. The landing page merges the two, static first.
 *
 * A new post is **never** live on arrival. `is_active` defaults to false, so the
 * public endpoints cannot see it until somebody flips the toggle in the console.
 * `published_at` is stamped the first time that happens and then left alone —
 * unpublishing and republishing must not reorder the blog.
 *
 * `content` is what the admin typed (a light markdown: `##`, `###`, `-`, `1.`,
 * `>`); `body` is that same text already parsed into the block array the landing
 * article page renders. Both are stored: the editor needs the source back to
 * edit, and the site must not have to parse anything at request time.
 */
export class BlogPost extends Model {
  static associate() {
    // Deliberately unassociated. `created_by` points at a platform_user, but a
    // published article must not disappear or fail to load because the admin who
    // wrote it was removed — the blog belongs to the platform, not to a person.
  }
}

/** What the landing page's filter row offers. "All" is a UI value, not a category. */
export const BLOG_CATEGORIES = [
  "Business Tips",
  "Industry Trends",
  "Project Management",
  "Client Relations",
  "Best Practices",
];

export default (sequelize) => {
  BlogPost.init(
    {
      blog_post_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },

      // The article's URL on the landing site: /blog/<slug>. Unique across the
      // table, and the service also refuses one that collides with a static post.
      slug: { type: DataTypes.STRING(220), allowNull: false, unique: true },

      title: { type: DataTypes.STRING(255), allowNull: false },
      // Falls back to `title` when the admin leaves it empty — <title> is never
      // allowed to be blank on a page Google is meant to index.
      seo_title: { type: DataTypes.STRING(255), allowNull: true },
      // The meta description. Falls back to `excerpt` for the same reason.
      description: { type: DataTypes.TEXT, allowNull: true },
      excerpt: { type: DataTypes.TEXT, allowNull: true },

      category: { type: DataTypes.STRING(80), allowNull: false, defaultValue: "Business Tips" },
      // "5 min read" — computed from the word count unless the admin overrides it.
      read_time: { type: DataTypes.STRING(30), allowNull: true },
      keywords: { type: DataTypes.ARRAY(DataTypes.TEXT), allowNull: false, defaultValue: [] },

      // Full S3 URL, ready to put in an <img src>. `image_key` is the object key
      // behind it, kept so replacing or deleting the post can remove the file.
      image: { type: DataTypes.STRING(1000), allowNull: true },
      image_key: { type: DataTypes.STRING(1000), allowNull: true },

      content: { type: DataTypes.TEXT, allowNull: true },
      body: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },

      // The toggle. False on create — see the class comment.
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      // First time it went live. Drives the date on the card and the article's
      // `datePublished`; null while it has never been published.
      published_at: { type: DataTypes.DATE, allowNull: true },

      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },

      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    {
      sequelize,
      tableName: "blog_post",
      modelName: "BlogPost",
      underscored: true,
      indexes: [
        { fields: ["is_active", "published_at"] },
        { fields: ["category"] },
      ],
    },
  );
  return BlogPost;
};
