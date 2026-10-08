

import { errorResponse, successResponse } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  getAllRangesService,
  createRangeService,
  updateRangeService,
  deleteRangeService,
  updateRangeActiveService,
} from "./range.service.js";
// ─────────────────────────────────────────────
// GET ALL RANGES
// ─────────────────────────────────────────────
export async function getAllRanges(req, res) {
  try {
    const builderId = req.user.builder_id;
    const ranges = await getAllRangesService(builderId);

    return successResponse(
      res,
      keysToCamelCase(ranges.map((r) => r.toJSON())),
      "Ranges fetched successfully.",
    );
  } catch (error) {
    console.error("Error fetching ranges:", error);
    const statusCode = error.statusCode || 500;
    return errorResponse(res, statusCode, error.message || "Internal Server Error");
  }
}

// ─────────────────────────────────────────────
// CREATE RANGE
// ─────────────────────────────────────────────
export async function createRange(req, res) {
  try {
    const newRange = await createRangeService(req.body, req.user, req.files);

    return successResponse(
      res,
      keysToCamelCase(newRange.toJSON()),
      "Range created successfully.",
    );
  } catch (err) {
    console.error("Error creating range:", err);
    const statusCode = err.statusCode || 500;
    return errorResponse(res, statusCode, err.message || "Internal Server Error");
  }
}

// ─────────────────────────────────────────────
// UPDATE RANGE
// ─────────────────────────────────────────────
export async function updateRange(req, res) {
  try {
    const { range_id } = req.params;
    const updatedRange = await updateRangeService(range_id, req.body, req.user, req.files);

    return successResponse(
      res,
      keysToCamelCase(updatedRange.toJSON()),
      "Range updated successfully.",
    );
  } catch (err) {
    console.error("Error updating range:", err);
    const statusCode = err.statusCode || 500;
    return errorResponse(res, statusCode, err.message || "Internal Server Error");
  }
}

// ─────────────────────────────────────────────
// DELETE RANGE
// ─────────────────────────────────────────────
export async function deleteRange(req, res) {
  try {
    const { range_id } = req.params;
    const builderId = req.user.builder_id;
    const deletedRange = await deleteRangeService(range_id, builderId);

    return successResponse(
      res,
      keysToCamelCase(deletedRange.toJSON()),
      "Range deleted successfully.",
    );
  } catch (error) {
    console.error("Error deleting range:", error);
    const statusCode = error.statusCode || 500;
    return errorResponse(res, statusCode, error?.message || "Internal Server Error");
  }
}

// ─────────────────────────────────────────────
// UPDATE RANGE ACTIVE STATUS
// ─────────────────────────────────────────────
export async function updateRangeActive(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const userId = req.user?.user_id;
    const { range_id } = req.params;
    const { is_active } = req.body;

    if (!range_id) {
      return errorResponse(res, 400, "range id is required");
    }

    if (typeof is_active !== "boolean") {
      return errorResponse(res, 400, "is_active must be boolean (true or false)");
    }

    const updatedRange = await updateRangeActiveService(range_id, builderId, userId, is_active);

    return successResponse(
      res,
      keysToCamelCase(updatedRange.toJSON()),
      "Range status updated successfully.",
    );
  } catch (error) {
    console.error("Error updating range is_active:", error);
    const statusCode = error.statusCode || 500;
    return errorResponse(res, statusCode, error?.message || "Internal Server Error");
  }
}
