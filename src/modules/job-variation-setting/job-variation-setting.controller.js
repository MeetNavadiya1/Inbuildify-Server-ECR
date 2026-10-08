
import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";

import {
  createJobVariationSettingsService,
  updateJobVariationSettingsService,
  getJobVariationSettingsService,
} from "./job-variation-settings.service.js";

// CREATE
export async function createJobVariationSettings(req, res) {
  try {
    const result = await createJobVariationSettingsService(req.body, req.user);

    return successResponse(
      res,
      keysToCamelCase(result),
      "Created successfully",
    );
  } catch (err) {
    return errorResponse(res, 400, err.message);
  }
}

// UPDATE
export async function updateJobVariationSettings(req, res) {
  try {
    const result = await updateJobVariationSettingsService(req.body, req.user);

    return successResponse(
      res,
      keysToCamelCase(result),
      "Updated successfully",
    );
  } catch (err) {
    return errorResponse(res, 400, err.message);
  }
}

// GET
export async function getUserJobVariationSettings(req, res) {
  try {
    const result = await getJobVariationSettingsService(req.user);

    return successResponse(
      res,
      keysToCamelCase(result),
      "Fetched successfully",
    );
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}
