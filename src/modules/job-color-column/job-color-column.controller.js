import { successResponse, errorResponse } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  createJobColorColumnService,
  getAllJobColorColumnsService,
  updateJobColorColumnService,
} from "./job-color-column.service.js";

/**
 * Creates a new job color column.
 */
export async function createJobColorColumn(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    const result = await createJobColorColumnService(req.body, {
      builderId,
      companyId,
    });

    return successResponse(
      res,
      keysToCamelCase(result),
      "Job color column created successfully.",
    );
  } catch (error) {
    console.error("Error creating job color column:", error);
    const statusCode = error.status || 500;
    const message = error.message || "Internal Server Error";
    return errorResponse(res, statusCode, message);
  }
}

/**
 * Retrieves all job color columns for the current builder.
 */
export async function getAllJobColorColumns(req, res) {
  try {
    const builderId = req.user?.builder_id;

    const result = await getAllJobColorColumnsService(req.query, {
      builderId,
    });

    return successResponse(
      res,
      keysToCamelCase(result),
      "Job color columns fetched successfully.",
    );
  } catch (error) {
    console.error("Error fetching job color columns:", error);
    const statusCode = error.status || 500;
    const message = error.message || "Internal Server Error";
    return errorResponse(res, statusCode, message);
  }
}

/**
 * Updates an existing job color column.
 */
export async function updateJobColorColumn(req, res) {
  try {
    const { id } = req.params;
    const builderId = req.user?.builder_id;

    const result = await updateJobColorColumnService(id, req.body, {
      builderId,
    });

    return successResponse(
      res,
      keysToCamelCase(result),
      "Job color column updated successfully.",
    );
  } catch (error) {
    console.error("Error updating job color column:", error);
    const statusCode = error.status || 500;
    const message = error.message || "Internal Server Error";
    return errorResponse(res, statusCode, message);
  }
}
