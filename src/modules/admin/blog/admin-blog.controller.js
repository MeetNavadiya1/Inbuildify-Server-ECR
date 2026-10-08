import { successResponse, errorResponse } from "../../../helper/response.js";
import { deleteFromS3 } from "../../../utils/s3Upload.js";
import {
  listBlogPostsService,
  getBlogPostStatsService,
  getBlogPostService,
  createBlogPostService,
  updateBlogPostService,
  setBlogPostActiveService,
  deleteBlogPostService,
} from "./admin-blog.service.js";

const fail = (res, error, label) => {
  console.error(`${label} Error:`, error);
  return errorResponse(res, error.status || error.statusCode || 500, error.message || "Internal Server Error");
};

export async function listBlogPosts(req, res) {
  try {
    const data = await listBlogPostsService({ query: req.query });
    return successResponse(res, data, "Articles fetched successfully.");
  } catch (error) {
    return fail(res, error, "List Blog Posts");
  }
}

export async function getBlogPostStats(req, res) {
  try {
    const data = await getBlogPostStatsService();
    return successResponse(res, data, "Blog stats fetched successfully.");
  } catch (error) {
    return fail(res, error, "Blog Stats");
  }
}

export async function getBlogPost(req, res) {
  try {
    const data = await getBlogPostService({ id: req.params.blog_post_id });
    return successResponse(res, data, "Article fetched successfully.");
  } catch (error) {
    return fail(res, error, "Get Blog Post");
  }
}

export async function createBlogPost(req, res) {
  try {
    const data = await createBlogPostService({ body: req.body, admin: req.admin });
    return successResponse(res, data, "Draft saved. Toggle it live when you're happy with it.");
  } catch (error) {
    return fail(res, error, "Create Blog Post");
  }
}

export async function updateBlogPost(req, res) {
  try {
    const data = await updateBlogPostService({
      id: req.params.blog_post_id,
      body: req.body,
      admin: req.admin,
    });
    return successResponse(res, data, "Article updated.");
  } catch (error) {
    return fail(res, error, "Update Blog Post");
  }
}

export async function setBlogPostActive(req, res) {
  try {
    const data = await setBlogPostActiveService({
      id: req.params.blog_post_id,
      isActive: req.body.is_active,
      admin: req.admin,
    });
    return successResponse(
      res,
      data,
      data.isActive ? "Article is live on the website." : "Article taken off the website.",
    );
  } catch (error) {
    return fail(res, error, "Toggle Blog Post");
  }
}

export async function deleteBlogPost(req, res) {
  try {
    const data = await deleteBlogPostService({ id: req.params.blog_post_id });
    return successResponse(res, data, "Article deleted.");
  } catch (error) {
    return fail(res, error, "Delete Blog Post");
  }
}

/**
 * The cover image, uploaded on its own before the post is saved.
 *
 * Separate from the save so the editor can show a real preview of the file that
 * is actually in S3 — a form that posts the image and the article together can
 * only preview a local blob, and re-uploads the same file on every correction to
 * the text. Both halves of the answer matter: `url` goes in the <img>, `key` is
 * what lets a later edit or delete remove the object.
 */
export async function uploadBlogImage(req, res) {
  try {
    if (!req.file) {
      return errorResponse(res, 400, "No image was uploaded. Choose a file and try again.");
    }
    return successResponse(
      res,
      { url: req.file.location, key: req.file.key },
      "Image uploaded.",
    );
  } catch (error) {
    return fail(res, error, "Upload Blog Image");
  }
}

/**
 * Drop an object the editor uploaded and then abandoned — a replaced cover, or a
 * "new post" dialog that was cancelled. Nothing else can reach these: they are
 * in S3 but no row points at them.
 */
export async function deleteBlogImage(req, res) {
  try {
    const key = req.body?.key;
    if (!key) return errorResponse(res, 400, "No image key was supplied.");
    // Scoped to this uploader's prefix so a stray call cannot reach a facade
    // image or a signed contract.
    if (!String(key).startsWith("blog/")) {
      return errorResponse(res, 400, "That key does not belong to the blog.");
    }

    await deleteFromS3(key);
    return successResponse(res, { key }, "Image removed.");
  } catch (error) {
    return fail(res, error, "Delete Blog Image");
  }
}

export default {
  listBlogPosts,
  getBlogPostStats,
  getBlogPost,
  createBlogPost,
  updateBlogPost,
  setBlogPostActive,
  deleteBlogPost,
  uploadBlogImage,
  deleteBlogImage,
};
