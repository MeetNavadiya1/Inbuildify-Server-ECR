import { successResponse, errorResponse } from "../../helper/response.js";
import { listPublicBlogPostsService, getPublicBlogPostService } from "./blog.service.js";

const fail = (res, error, label) => {
  console.error(`${label} Error:`, error);
  return errorResponse(res, error.status || error.statusCode || 500, error.message || "Internal Server Error");
};

export async function listPublicBlogPosts(req, res) {
  try {
    const data = await listPublicBlogPostsService({ query: req.query });
    return successResponse(res, data, "Articles fetched successfully.");
  } catch (error) {
    return fail(res, error, "Public Blog List");
  }
}

export async function getPublicBlogPost(req, res) {
  try {
    const data = await getPublicBlogPostService({ slug: req.params.slug });
    return successResponse(res, data, "Article fetched successfully.");
  } catch (error) {
    return fail(res, error, "Public Blog Article");
  }
}

export default { listPublicBlogPosts, getPublicBlogPost };
